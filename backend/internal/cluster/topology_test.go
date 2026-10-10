package cluster

import (
	"context"
	"encoding/json"
	"fmt"
	core "k8s.io/api/core/v1"
	discovery "k8s.io/api/discovery/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestTopologyProjectionKeepsRelationshipsAndHidesVolumeSources(t *testing.T) {
	p := samplePod("multi")
	p.Spec.Containers = append(p.Spec.Containers, core.Container{Name: "sidecar"}, core.Container{Name: "cache"})
	p.Spec.Containers[0].Resources.Requests = core.ResourceList{core.ResourceMemory: resource.MustParse("16Mi")}
	p.Spec.Containers[0].VolumeMounts = []core.VolumeMount{{Name: "shared", MountPath: "/private-location"}}
	p.Spec.Volumes = []core.Volume{{Name: "shared", VolumeSource: core.VolumeSource{PersistentVolumeClaim: &core.PersistentVolumeClaimVolumeSource{ClaimName: "data"}}}, {Name: "hidden", VolumeSource: core.VolumeSource{Secret: &core.SecretVolumeSource{SecretName: "private-secret-name"}}}}
	values := project(p, time.Now())
	if len(values) != 6 {
		t.Fatalf("expected pod, three containers, two volumes; got %d", len(values))
	}
	if values[1].Details["request memory"] != "16Mi" || len(values[1].Links) != 1 {
		t.Fatal("resource requests or mounts missing")
	}
	if values[4].Links[0].Name != "data" {
		t.Fatal("claim reference missing")
	}
	raw, _ := json.Marshal(values)
	if strings.Contains(string(raw), "private-secret-name") || strings.Contains(string(raw), "private-location") || strings.Contains(string(raw), "never-serialize-this") {
		t.Fatal("private source or environment leaked")
	}
	ready := true
	slice := &discovery.EndpointSlice{ObjectMeta: metav1.ObjectMeta{Namespace: "shop", Labels: map[string]string{discovery.LabelServiceName: "db"}}, Endpoints: []discovery.Endpoint{{Conditions: discovery.EndpointConditions{Ready: &ready}, TargetRef: &core.ObjectReference{Kind: "Pod", Namespace: "shop", Name: p.Name, UID: p.UID}}}}
	endpoints := project(slice, time.Now())[0]
	if len(endpoints.Links) != 2 || endpoints.Links[1].UID != "multi" || endpoints.Links[1].Relation != "ready endpoint" {
		t.Fatal("endpoint identity or readiness lost")
	}
}

func TestMetricsSamplesHaveUnitsAndFailuresEraseUsage(t *testing.T) {
	s := NewStore("test")
	s.observe(samplePod("sample"))
	fail := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if fail {
			w.WriteHeader(503)
			return
		}
		timestamp := time.Now().UTC().Format(time.RFC3339)
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "nodes") {
			fmt.Fprint(w, `{"items":[]}`)
			return
		}
		fmt.Fprintf(w, `{"items":[{"metadata":{"name":"worker","namespace":"shop"},"timestamp":%q,"window":"15s","containers":[{"name":"app","usage":{"cpu":"120m","memory":"16Mi"}}]}]}`, timestamp)
	}))
	defer server.Close()
	client, err := kubernetes.NewForConfig(&rest.Config{Host: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	s.pollMetrics(context.Background(), client.CoreV1().RESTClient())
	snapshot := s.Snapshot()
	if snapshot.Metrics.State != "observing" {
		t.Fatal("metrics not observed")
	}
	for _, r := range snapshot.Resources {
		if r.Usage == nil || r.Usage.CPUMilli != 120 || r.Usage.MemoryBytes != 16*1024*1024 {
			t.Fatalf("incorrect units: %+v", r.Usage)
		}
	}
	fail = true
	s.pollMetrics(context.Background(), client.CoreV1().RESTClient())
	for _, r := range s.Snapshot().Resources {
		if r.Usage != nil {
			t.Fatal("failed metrics retained a current usage claim")
		}
	}
}
