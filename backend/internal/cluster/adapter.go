package cluster

import (
	"context"
	"errors"
	"sync"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	networkv1 "k8s.io/api/networking/v1"
	storagev1 "k8s.io/api/storage/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd"
)

func Config(kubeconfig, kubecontext string, inCluster bool) (*rest.Config, error) {
	var config *rest.Config
	var err error
	if inCluster {
		if kubeconfig != "" || kubecontext != "" {
			return nil, errors.New("in-cluster cannot be combined with kubeconfig or context")
		}
		config, err = rest.InClusterConfig()
	} else {
		loading := clientcmd.NewDefaultClientConfigLoadingRules()
		loading.ExplicitPath = kubeconfig
		overrides := &clientcmd.ConfigOverrides{CurrentContext: kubecontext}
		config, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loading, overrides).ClientConfig()
	}
	if err != nil {
		return nil, err
	}
	config.QPS, config.Burst = 5, 10
	// Watches are long-lived streams. Bound individual LISTs and probes instead.
	config.Timeout = 0
	config.UserAgent = "kubehabitat/0.2.0"
	return config, nil
}

type listCall func(context.Context, metav1.ListOptions) (runtime.Object, error)
type watchCall func(context.Context, metav1.ListOptions) (watch.Interface, error)

// Start uses one shared informer for each supported API resource. Containers are derived.
// It returns immediately so permission failures remain visible through the HTTP API.
func (s *Store) Start(ctx context.Context, client kubernetes.Interface) error {
	core := client.CoreV1()
	definitions := []struct {
		kind   string
		object runtime.Object
		list   listCall
		watch  watchCall
	}{
		{"Node", &corev1.Node{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) { return core.Nodes().List(c, o) }, core.Nodes().Watch},
		{"Namespace", &corev1.Namespace{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return core.Namespaces().List(c, o)
		}, core.Namespaces().Watch},
		{"Pod", &corev1.Pod{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) { return core.Pods("").List(c, o) }, core.Pods("").Watch},
		{"Service", &corev1.Service{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return core.Services("").List(c, o)
		}, core.Services("").Watch},
		{"EndpointSlice", &discoveryv1.EndpointSlice{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.DiscoveryV1().EndpointSlices("").List(c, o)
		}, client.DiscoveryV1().EndpointSlices("").Watch},
		{"Ingress", &networkv1.Ingress{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.NetworkingV1().Ingresses("").List(c, o)
		}, client.NetworkingV1().Ingresses("").Watch},
		{"NetworkPolicy", &networkv1.NetworkPolicy{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.NetworkingV1().NetworkPolicies("").List(c, o)
		}, client.NetworkingV1().NetworkPolicies("").Watch},
		{"PersistentVolumeClaim", &corev1.PersistentVolumeClaim{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return core.PersistentVolumeClaims("").List(c, o)
		}, core.PersistentVolumeClaims("").Watch},
		{"PersistentVolume", &corev1.PersistentVolume{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return core.PersistentVolumes().List(c, o)
		}, core.PersistentVolumes().Watch},
		{"StorageClass", &storagev1.StorageClass{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.StorageV1().StorageClasses().List(c, o)
		}, client.StorageV1().StorageClasses().Watch},
		{"ResourceQuota", &corev1.ResourceQuota{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return core.ResourceQuotas("").List(c, o)
		}, core.ResourceQuotas("").Watch},
		{"Deployment", &appsv1.Deployment{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.AppsV1().Deployments("").List(c, o)
		}, client.AppsV1().Deployments("").Watch},
		{"ReplicaSet", &appsv1.ReplicaSet{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.AppsV1().ReplicaSets("").List(c, o)
		}, client.AppsV1().ReplicaSets("").Watch},
		{"StatefulSet", &appsv1.StatefulSet{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.AppsV1().StatefulSets("").List(c, o)
		}, client.AppsV1().StatefulSets("").Watch},
		{"DaemonSet", &appsv1.DaemonSet{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.AppsV1().DaemonSets("").List(c, o)
		}, client.AppsV1().DaemonSets("").Watch},
		{"Job", &batchv1.Job{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.BatchV1().Jobs("").List(c, o)
		}, client.BatchV1().Jobs("").Watch},
		{"CronJob", &batchv1.CronJob{}, func(c context.Context, o metav1.ListOptions) (runtime.Object, error) {
			return client.BatchV1().CronJobs("").List(c, o)
		}, client.BatchV1().CronJobs("").Watch},
	}
	for index, definition := range definitions {
		d := definition
		lw := &cache.ListWatch{
			ListWithContextFunc: func(c context.Context, options metav1.ListOptions) (runtime.Object, error) {
				bounded, cancel := context.WithTimeout(c, 15*time.Second)
				defer cancel()
				value, err := d.list(bounded, options)
				s.verify(d.kind, err)
				return value, err
			},
			WatchFuncWithContext: func(c context.Context, options metav1.ListOptions) (watch.Interface, error) {
				// Keep the reflector's randomized server-side watch timeout.
				generation := s.beginWatch(d.kind)
				w, err := d.watch(c, options)
				s.watchTransport(d.kind, generation, err)
				if err != nil {
					return nil, err
				}
				return monitorWatch(c, w, func(err error) { s.watchTransport(d.kind, generation, err) }), nil
			},
		}
		informer := cache.NewSharedIndexInformer(cache.ToListWatcherWithWatchListSemantics(lw, client), d.object, 0, cache.Indexers{})
		if _, err := informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
			AddFunc: s.observe, UpdateFunc: s.update, DeleteFunc: s.remove,
		}); err != nil {
			return err
		}
		if err := informer.SetWatchErrorHandlerWithContext(func(_ context.Context, _ *cache.Reflector, err error) { s.transport(d.kind, err) }); err != nil {
			return err
		}
		s.mu.Lock()
		s.informers[d.kind] = informer
		s.mu.Unlock()
		go informer.RunWithContext(ctx)
		go func() {
			// Stagger verification across resource kinds rather than bursting every 15s.
			timer := time.NewTimer(15*time.Second + time.Duration(index)*250*time.Millisecond)
			defer timer.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-timer.C:
					probe, cancel := context.WithTimeout(ctx, 5*time.Second)
					_, err := d.list(probe, metav1.ListOptions{Limit: 1})
					cancel()
					s.verify(d.kind, err)
					timer.Reset(15 * time.Second)
				}
			}
		}()
	}
	return nil
}

type observedWatch struct {
	watch.Interface
	output chan watch.Event
	once   sync.Once
	done   chan struct{}
}

func (w *observedWatch) Stop()                          { w.once.Do(func() { close(w.done); w.Interface.Stop() }) }
func (w *observedWatch) ResultChan() <-chan watch.Event { return w.output }

func monitorWatch(ctx context.Context, source watch.Interface, changed func(error)) watch.Interface {
	w := &observedWatch{Interface: source, output: make(chan watch.Event), done: make(chan struct{})}
	go func() {
		defer close(w.output)
		defer w.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-w.done:
				return
			case event, ok := <-source.ResultChan():
				if !ok {
					select {
					case <-w.done:
						return
					default:
					}
					if ctx.Err() == nil {
						changed(errors.New("watch closed"))
					}
					return
				}
				if event.Type == watch.Error {
					changed(apierrors.FromObject(event.Object))
				}
				select {
				case w.output <- event:
				case <-ctx.Done():
					return
				case <-w.done:
					return
				}
			}
		}
	}()
	return w
}
