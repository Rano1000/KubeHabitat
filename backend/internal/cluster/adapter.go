package cluster

import (
	"context"
	"errors"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
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
	config.Timeout = 40 * time.Second
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
	}
	for _, definition := range definitions {
		d := definition
		lw := &cache.ListWatch{
			ListWithContextFunc: func(c context.Context, options metav1.ListOptions) (runtime.Object, error) {
				value, err := d.list(c, options)
				s.verify(d.kind, err)
				return value, err
			},
			WatchFuncWithContext: func(c context.Context, options metav1.ListOptions) (watch.Interface, error) {
				timeout := int64(30)
				options.TimeoutSeconds = &timeout
				w, err := d.watch(c, options)
				s.transport(d.kind, err)
				if err != nil {
					return nil, err
				}
				return monitorWatch(c, w, func(err error) { s.transport(d.kind, err) }), nil
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
			ticker := time.NewTicker(15 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					probe, cancel := context.WithTimeout(ctx, 5*time.Second)
					_, err := d.list(probe, metav1.ListOptions{Limit: 1})
					cancel()
					s.verify(d.kind, err)
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
		defer func() {
			if ctx.Err() == nil {
				changed(errors.New("watch closed"))
			}
		}()
		for {
			select {
			case <-ctx.Done():
				return
			case <-w.done:
				return
			case event, ok := <-source.ResultChan():
				if !ok {
					return
				}
				if event.Type == watch.Error {
					changed(errors.New("watch error"))
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
