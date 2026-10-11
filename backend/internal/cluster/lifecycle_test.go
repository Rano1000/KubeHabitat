package cluster

import (
	"encoding/json"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"strings"
	"testing"
	"time"
)

func TestTerminationEvidenceSeparatesPreviousRunAndRedactsMessages(t *testing.T) {
	pod := samplePod("lifecycle")
	start := metav1.NewTime(time.Date(2026, 10, 11, 10, 0, 0, 0, time.UTC))
	finish := metav1.NewTime(start.Add(time.Minute))
	pod.Status.Reason = "Evicted"
	pod.Status.Message = "private-pod-message"
	status := &pod.Status.ContainerStatuses[0]
	status.Ready = true
	status.State = corev1.ContainerState{Running: &corev1.ContainerStateRunning{StartedAt: finish}}
	status.LastTerminationState = corev1.ContainerState{Terminated: &corev1.ContainerStateTerminated{Reason: "OOMKilled", ExitCode: 137, StartedAt: start, FinishedAt: finish, Message: "private-termination-message", ContainerID: "private-runtime-id"}}
	values := project(pod, time.Now().UTC())
	container := values[1]
	if container.State != "Running" || container.Termination != nil || container.LastTermination == nil || container.LastTermination.ExitCode != 137 || container.LastTermination.Reason != "OOMKilled" || container.StartedAt == nil || !container.LastTermination.FinishedAt.Equal(finish.Time) {
		t.Fatalf("current state and previous termination mixed: %+v", container)
	}
	if values[0].Reason != "Evicted" {
		t.Fatal("pod status reason lost")
	}
	encoded, _ := json.Marshal(values)
	if strings.Contains(string(encoded), "private-") || strings.Contains(string(encoded), "never-serialize-this") {
		t.Fatal("sensitive messages or runtime fields leaked")
	}
	status.State = corev1.ContainerState{Terminated: &corev1.ContainerStateTerminated{Reason: "Completed", ExitCode: 0, FinishedAt: finish}}
	container = project(pod, time.Now().UTC())[1]
	if container.Termination == nil || container.Termination.ExitCode != 0 || container.Termination.StartedAt != nil || container.StartedAt != nil || container.LastTermination == nil {
		t.Fatal("current and historical terminations or missing timestamps lost")
	}
}

func TestDeletionDoesNotFabricatePodFailure(t *testing.T) {
	pod := samplePod("deleting")
	deletion := metav1.Now()
	pod.DeletionTimestamp = &deletion
	pod.Status.Phase = corev1.PodFailed
	if project(pod, time.Now().UTC())[0].State != "Terminating" {
		t.Fatal("deletion misrepresented as an active crash")
	}
}
