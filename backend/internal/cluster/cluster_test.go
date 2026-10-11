package cluster

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
)

func samplePod(uid string) *corev1.Pod {
	return &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "worker", Namespace: "shop", UID: types.UID(uid), ResourceVersion: "12"},
		Spec:   corev1.PodSpec{NodeName: "worker-a", Containers: []corev1.Container{{Name: "app", Env: []corev1.EnvVar{{Name: "TOKEN", Value: "never-serialize-this"}}}}},
		Status: corev1.PodStatus{Phase: corev1.PodRunning, Conditions: []corev1.PodCondition{{Type: corev1.PodReady, Status: corev1.ConditionFalse}}, ContainerStatuses: []corev1.ContainerStatus{{Name: "app", RestartCount: 3, State: corev1.ContainerState{Waiting: &corev1.ContainerStateWaiting{Reason: "CrashLoopBackOff"}}}}}}
}

func TestControllingOwnerIsObservedWithoutInferringDeployment(t *testing.T) {
	pod := samplePod("owned")
	controller := true
	pod.OwnerReferences = []metav1.OwnerReference{{UID: "unrelated", Kind: "Other", Name: "ignore"}, {UID: "rs-uid", Kind: "ReplicaSet", Name: "web-ab12", Controller: &controller}}
	values := project(pod, time.Now().UTC())
	if values[0].Owner == nil || values[0].Owner.UID != "rs-uid" || values[0].Owner.Kind != "ReplicaSet" || values[0].Owner.Name != "web-ab12" {
		t.Fatalf("incorrect owner: %+v", values[0].Owner)
	}
	pod.OwnerReferences = nil
	if project(pod, time.Now().UTC())[0].Owner != nil {
		t.Fatal("standalone pod acquired an invented owner")
	}
}

func TestProjectionPreservesLifecycleAndRedactsSpecs(t *testing.T) {
	pod := samplePod("first")
	s := NewStore("test")
	s.observe(pod)
	values := s.Snapshot().Resources
	if len(values) != 2 {
		t.Fatalf("want pod and container, got %d", len(values))
	}
	var parent, child Resource
	for _, r := range values {
		if r.Kind == "Pod" {
			parent = r
		} else {
			child = r
		}
	}
	if parent.Phase != "Running" || parent.State != "NotReady" || parent.Ready == nil || *parent.Ready {
		t.Fatalf("running was confused with ready: %+v", parent)
	}
	if child.State != "Waiting" || child.Reason != "CrashLoopBackOff" || child.Parent != parent.ID || *child.RestartCount != 3 {
		t.Fatalf("incorrect container projection: %+v", child)
	}
	encoded, _ := json.Marshal(s.Snapshot())
	if strings.Contains(string(encoded), "never-serialize-this") || strings.Contains(string(encoded), "TOKEN") {
		t.Fatal("pod environment leaked")
	}
	pod.Status.ContainerStatuses[0].RestartCount = 4
	s.observe(pod)
	if len(s.Snapshot().Resources) != 2 {
		t.Fatal("restart created a false replacement")
	}
	s.remove(pod)
	s.observe(pod)
	s.update(pod, samplePod("second"))
	for _, r := range s.Snapshot().Resources {
		if r.ID == parent.ID || r.Parent == parent.ID {
			t.Fatal("replacement retained old UID")
		}
	}
	pod = samplePod("complete")
	pod.Status.Phase = corev1.PodSucceeded
	if project(pod, time.Now())[0].State != "Completed" {
		t.Fatal("successful completion became a crash")
	}
	pod.Status.Phase = corev1.PodPending
	pod.Spec.NodeName = ""
	if project(pod, time.Now())[0].State != "Unscheduled" {
		t.Fatal("unscheduled pod assigned to a node")
	}
}

func TestListSuccessCannotHideWatchDenial(t *testing.T) {
	s := NewStore("test")
	s.transport("Pod", apierrors.NewForbidden(schema.GroupResource{Resource: "pods"}, "", nil))
	s.verify("Pod", nil)
	for _, v := range s.Snapshot().Visibility {
		if v.Kind == "Pod" && v.State != "denied" {
			t.Fatalf("LIST hid WATCH failure: %+v", v)
		}
	}
	s.transport("Pod", nil)
	for _, v := range s.Snapshot().Visibility {
		if v.Kind == "Pod" && v.State != "connecting" {
			t.Fatalf("unsynchronized cache looked live: %+v", v)
		}
	}
}

func TestInformerObservesUpdatesAndDeletesDerivedContainers(t *testing.T) {
	client := fake.NewClientset(samplePod("live"))
	s := NewStore("test")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := s.Start(ctx, client); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return s.Snapshot().Connection == "connected" && len(s.Snapshot().Resources) == 2 })
	pod, err := client.CoreV1().Pods("shop").Get(ctx, "worker", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	pod.Status.ContainerStatuses[0].RestartCount = 7
	if _, err = client.CoreV1().Pods("shop").UpdateStatus(ctx, pod, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool {
		for _, r := range s.Snapshot().Resources {
			if r.Kind == "Container" && r.RestartCount != nil && *r.RestartCount == 7 {
				return true
			}
		}
		return false
	})
	if err = client.CoreV1().Pods("shop").Delete(ctx, "worker", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(s.Snapshot().Resources) == 0 })
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("observation did not converge")
}
