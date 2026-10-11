package cluster

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
)

func evidenceFixture(t *testing.T) (*Store, *fake.Clientset, *corev1.Pod, string) {
	t.Helper()
	pod := samplePod("evidence")
	client := fake.NewClientset(pod)
	store := NewStore("test")
	store.observe(pod)
	store.ConfigureInvestigation(client, true)
	values := project(pod, time.Now())
	return store, client, pod, values[1].ID
}

func TestEventsAreScopedToUIDAndDoNotReadLogs(t *testing.T) {
	store, client, pod, id := evidenceFixture(t)
	client.PrependReactor("list", "events", func(action k8stesting.Action) (bool, runtime.Object, error) {
		if action.GetNamespace() != pod.Namespace || action.(k8stesting.ListAction).GetListRestrictions().Fields.String() != "involvedObject.uid="+string(pod.UID) {
			t.Fatal("events not scoped to selected identity")
		}
		now := metav1.Now()
		return true, &corev1.EventList{Items: []corev1.Event{
			{ObjectMeta: metav1.ObjectMeta{UID: "wrong", Namespace: pod.Namespace}, InvolvedObject: corev1.ObjectReference{UID: "replacement"}, Message: "must-not-leak"},
			{ObjectMeta: metav1.ObjectMeta{UID: "event", Namespace: pod.Namespace}, InvolvedObject: corev1.ObjectReference{UID: pod.UID, FieldPath: "spec.containers{web}"}, Type: "Warning", Reason: "BackOff", Message: "Reported retry\x1b", Series: &corev1.EventSeries{Count: 4, LastObservedTime: metav1.NewMicroTime(now.Time)}},
		}}, nil
	})
	store.logReader = func(context.Context, string, string, *corev1.PodLogOptions) (io.ReadCloser, error) {
		t.Fatal("events fetched logs implicitly")
		return nil, nil
	}
	result := store.Investigate(context.Background(), id)
	if result.Target.State != "available" || result.Events.State != "available" || len(result.Events.Items) != 1 || result.Events.Items[0].Count != 4 || strings.Contains(result.Events.Items[0].Message, "\x1b") || result.TargetUID != string(pod.UID) {
		t.Fatalf("wrong evidence %+v", result)
	}
	client.PrependReactor("list", "events", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewForbidden(schema.GroupResource{Resource: "events"}, "", errors.New("private-error"))
	})
	result = store.Investigate(context.Background(), id)
	encoded, _ := json.Marshal(result)
	if result.Events.State != "denied" || strings.Contains(string(encoded), "private-error") {
		t.Fatal("permission failure hidden or raw error leaked")
	}
}

func TestLogsBoundedAndDisabledWithoutReading(t *testing.T) {
	store, _, pod, id := evidenceFixture(t)
	calls := 0
	store.logReader = func(_ context.Context, ns, name string, opts *corev1.PodLogOptions) (io.ReadCloser, error) {
		calls++
		if ns != pod.Namespace || name != pod.Name || opts.Container != pod.Spec.Containers[0].Name || !opts.Previous || opts.Follow || !opts.Timestamps || *opts.LimitBytes != LogByteLimit || *opts.TailLines != 200 || *opts.SinceSeconds != 900 {
			t.Fatal("unbounded or wrong-container log request")
		}
		return io.NopCloser(strings.NewReader(strings.Repeat("x", int(LogByteLimit)+2000))), nil
	}
	store.logsEnabled = false
	if got := store.ReadLogs(context.Background(), id, true); got.State != "disabled" || calls != 0 {
		t.Fatal("disabled logs were fetched")
	}
	store.logsEnabled = true
	got := store.ReadLogs(context.Background(), id, true)
	if got.State != "available" || !got.Truncated || len(got.Text) != int(LogByteLimit) || calls != 1 {
		t.Fatalf("read not bounded %+v", got.EvidenceStatus)
	}
	if got := store.ReadLogs(context.Background(), "Pod:"+string(pod.UID), false); got.State != "unsupported" {
		t.Fatal("pod chose an implicit container")
	}
}

func TestLogsNeverReturnAReplacementPodsBody(t *testing.T) {
	for _, replaceDuringRead := range []bool{false, true} {
		store, client, pod, id := evidenceFixture(t)
		reads := 0
		client.PrependReactor("get", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
			reads++
			copy := pod.DeepCopy()
			if !replaceDuringRead || reads > 1 {
				copy.UID = types.UID("replacement")
			}
			return true, copy, nil
		})
		logReads := 0
		store.logReader = func(context.Context, string, string, *corev1.PodLogOptions) (io.ReadCloser, error) {
			logReads++
			return io.NopCloser(strings.NewReader("replacement-sensitive-body")), nil
		}
		result := store.ReadLogs(context.Background(), id, false)
		if result.State != "replaced" || result.Text != "" || (!replaceDuringRead && logReads != 0) {
			t.Fatal("replacement logs returned")
		}
	}
}

func TestMissingPreviousLogsAndDeletedPodAreExplicit(t *testing.T) {
	store, client, pod, id := evidenceFixture(t)
	store.logReader = func(context.Context, string, string, *corev1.PodLogOptions) (io.ReadCloser, error) {
		return nil, apierrors.NewBadRequest("private unavailable previous run")
	}
	if got := store.ReadLogs(context.Background(), id, true); got.State != "unavailable" || strings.Contains(got.Reason, "private") || got.Text != "" {
		t.Fatal("missing previous run misrepresented")
	}
	if err := client.CoreV1().Pods(pod.Namespace).Delete(context.Background(), pod.Name, metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	if got := store.ReadLogs(context.Background(), id, false); got.State != "missing" {
		t.Fatal("deleted pod not explicit")
	}
	store.remove(pod)
	if got := store.Investigate(context.Background(), id); got.Target.State != "missing" {
		t.Fatal("removed cache identity fabricated")
	}
}

func TestKubernetesLogTransportUsesReadOnlyBoundedQuery(t *testing.T) {
	pod := samplePod("transport")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("non-read request")
		}
		if strings.HasSuffix(r.URL.Path, "/log") {
			q := r.URL.Query()
			if q.Get("container") != pod.Spec.Containers[0].Name || q.Get("previous") != "true" || q.Get("tailLines") != "200" || q.Get("sinceSeconds") != "900" || q.Get("limitBytes") != "65536" || q.Get("timestamps") != "true" || q.Get("follow") == "true" {
				t.Errorf("wrong query %s", r.URL.RawQuery)
			}
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte("2026-10-11T12:00:00Z reported log\n"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(pod)
	}))
	defer server.Close()
	client, err := kubernetes.NewForConfig(&rest.Config{Host: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	store := NewStore("test")
	store.observe(pod)
	store.ConfigureInvestigation(client, true)
	got := store.ReadLogs(context.Background(), project(pod, time.Now())[1].ID, true)
	if got.State != "available" || !strings.Contains(got.Text, "reported log") {
		t.Fatalf("transport failed %+v", got)
	}
}
