package cluster

import (
	"context"
	"errors"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes/fake"
	kt "k8s.io/client-go/testing"
	"testing"
	"time"
)

func TestStoppedWatchDoesNotReportAnOutage(t *testing.T) {
	source := watch.NewRaceFreeFake()
	changed := make(chan error, 2)
	monitored := monitorWatch(context.Background(), source, func(err error) { changed <- err })
	monitored.Stop()
	for range monitored.ResultChan() {
	}
	select {
	case err := <-changed:
		t.Fatalf("intentional stop reported %v", err)
	default:
	}
}

func TestUnexpectedClosureAndWatchStatusKeepFailureEvidence(t *testing.T) {
	for _, denied := range []bool{false, true} {
		source := watch.NewRaceFreeFake()
		changed := make(chan error, 3)
		monitored := monitorWatch(context.Background(), source, func(err error) { changed <- err })
		if denied {
			source.Error(&metav1.Status{Status: "Failure", Reason: metav1.StatusReasonUnauthorized, Code: 401})
			event := <-monitored.ResultChan()
			if event.Type != watch.Error {
				t.Fatal("watch status not forwarded")
			}
		} else {
			source.Stop()
		}
		select {
		case err := <-changed:
			if denied && !apierrors.IsUnauthorized(err) {
				t.Fatal("watch credential error lost its category")
			}
		case <-time.After(time.Second):
			t.Fatal("failure not reported")
		}
		monitored.Stop()
		for range monitored.ResultChan() {
		}
	}
}

func TestOldWatchCannotInvalidateItsReplacement(t *testing.T) {
	s := NewStore("test")
	old := s.beginWatch("Pod")
	current := s.beginWatch("Pod")
	s.watchTransport("Pod", current, nil)
	s.watchTransport("Pod", old, errors.New("closed"))
	if s.visibility["Pod"].State != "observing" {
		t.Fatal("late closure invalidated replacement")
	}
	s.watchTransport("Pod", current, apierrors.NewUnauthorized("private response"))
	s.verify("Pod", nil)
	if s.visibility["Pod"].State != "denied" || s.visibility["Pod"].Reason != "Kubernetes credentials rejected or expired; renew the connection credentials" {
		t.Fatal("expired credentials hidden or response leaked")
	}
}

func TestInformerPreservesLongServerWatchTimeout(t *testing.T) {
	client := fake.NewClientset()
	timeout := make(chan int64, 1)
	client.PrependWatchReactor("pods", func(action kt.Action) (bool, watch.Interface, error) {
		options := action.(interface{ GetListOptions() metav1.ListOptions }).GetListOptions()
		if options.TimeoutSeconds != nil {
			timeout <- *options.TimeoutSeconds
		}
		return true, watch.NewRaceFreeFake(), nil
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := NewStore("test").Start(ctx, client); err != nil {
		t.Fatal(err)
	}
	select {
	case seconds := <-timeout:
		if seconds < 300 {
			t.Fatalf("stream forced to %ds", seconds)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("pod watch not started")
	}
}
