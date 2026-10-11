package cluster

import (
	"encoding/json"
	apps "k8s.io/api/apps/v1"
	batch "k8s.io/api/batch/v1"
	core "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"strings"
	"testing"
	"time"
)

func TestWorkloadProjectionPreservesChainWithoutTemplateContents(t *testing.T) {
	controller, replicas := true, int32(2)
	deployment := &apps.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "web", UID: "deployment-uid", Namespace: "shop", Generation: 3}, Spec: apps.DeploymentSpec{Replicas: &replicas, Template: core.PodTemplateSpec{Spec: core.PodSpec{Containers: []core.Container{{Name: "private-template", Env: []core.EnvVar{{Name: "TOKEN", Value: "do-not-project"}}}}}}}, Status: apps.DeploymentStatus{ObservedGeneration: 2, ReadyReplicas: 2, UpdatedReplicas: 2}}
	projected := project(deployment, time.Now())[0]
	if projected.State != "Reconciling" {
		t.Fatal("old generation falsely ready")
	}
	deployment.Status.ObservedGeneration = 3
	if project(deployment, time.Now())[0].State != "Ready" {
		t.Fatal("current replica status not represented")
	}
	set := &apps.ReplicaSet{ObjectMeta: metav1.ObjectMeta{Name: "web-rs", UID: "rs-uid", Namespace: "shop", OwnerReferences: []metav1.OwnerReference{{Kind: "Deployment", Name: "web", UID: deployment.UID, Controller: &controller}}}}
	projected = project(set, time.Now())[0]
	if projected.Owner == nil || projected.Owner.UID != "deployment-uid" {
		t.Fatal("controller chain lost")
	}
	raw, _ := json.Marshal(project(deployment, time.Now()))
	if strings.Contains(string(raw), "private-template") || strings.Contains(string(raw), "do-not-project") {
		t.Fatal("pod template leaked")
	}
}

func TestZeroReplicaAndJobRetriesDoNotMeanFailure(t *testing.T) {
	zero := int32(0)
	deployment := &apps.Deployment{Spec: apps.DeploymentSpec{Replicas: &zero}}
	if project(deployment, time.Now())[0].State != "ScaledToZero" {
		t.Fatal("zero replicas misclassified")
	}
	job := &batch.Job{Status: batch.JobStatus{Active: 1, Failed: 2}}
	if project(job, time.Now())[0].State != "Active" {
		t.Fatal("retry attempts treated as final job failure")
	}
	job.Status.Conditions = []batch.JobCondition{{Type: batch.JobFailed, Status: core.ConditionTrue, Reason: "BackoffLimitExceeded"}}
	if project(job, time.Now())[0].State != "Failed" {
		t.Fatal("confirmed job failure omitted")
	}
	job.Status.Conditions = []batch.JobCondition{{Type: batch.JobComplete, Status: core.ConditionTrue}}
	if project(job, time.Now())[0].State != "Completed" {
		t.Fatal("completion treated as failure")
	}
}
