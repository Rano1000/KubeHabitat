package cluster

import (
	"context"
	"fmt"
	core "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMetricsDoNotInventZerosOrCompletePartialPodSamples(t *testing.T) {
	for _, tc := range []struct {
		name, containers, window string
		age                      time.Duration
		pod, app, sidecar        bool
		created                  bool
	}{
		{name: "measured zero", containers: `[{"name":"app","usage":{"cpu":"0","memory":"0"}}]`, window: "15s", pod: true, app: true},
		{name: "missing cpu", containers: `[{"name":"app","usage":{"memory":"16Mi"}}]`, window: "15s"},
		{name: "negative", containers: `[{"name":"app","usage":{"cpu":"-1m","memory":"16Mi"}}]`, window: "15s"},
		{name: "missing sidecar", containers: `[{"name":"app","usage":{"cpu":"1m","memory":"16Mi"}}]`, window: "15s", app: true, sidecar: true},
		{name: "unrecognized container", containers: `[{"name":"old","usage":{"cpu":"1m","memory":"16Mi"}}]`, window: "15s"},
		{name: "empty containers", containers: `[]`, window: "15s"},
		{name: "stale", containers: `[{"name":"app","usage":{"cpu":"1m","memory":"16Mi"}}]`, window: "15s", age: 2 * time.Minute},
		{name: "future", containers: `[{"name":"app","usage":{"cpu":"1m","memory":"16Mi"}}]`, window: "15s", age: -time.Minute},
		{name: "invalid window", containers: `[{"name":"app","usage":{"cpu":"1m","memory":"16Mi"}}]`, window: "unknown"},
		{name: "previous pod sample", containers: `[{"name":"app","usage":{"cpu":"1m","memory":"16Mi"}}]`, window: "15s", age: 30 * time.Second, created: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := NewStore("test")
			pod := samplePod("sample")
			if tc.sidecar {
				pod.Spec.Containers = append(pod.Spec.Containers, core.Container{Name: "sidecar"})
			}
			if tc.created {
				pod.CreationTimestamp = metav1.NewTime(time.Now().Add(-10 * time.Second))
			}
			s.observe(pod)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if strings.HasSuffix(r.URL.Path, "nodes") {
					fmt.Fprint(w, `{"items":[]}`)
					return
				}
				fmt.Fprintf(w, `{"items":[{"metadata":{"name":"worker","namespace":"shop"},"timestamp":%q,"window":%q,"containers":%s}]}`, time.Now().Add(-tc.age).UTC().Format(time.RFC3339), tc.window, tc.containers)
			}))
			defer server.Close()
			client, err := kubernetes.NewForConfig(&rest.Config{Host: server.URL})
			if err != nil {
				t.Fatal(err)
			}
			s.pollMetrics(context.Background(), client.CoreV1().RESTClient())
			for _, r := range s.Snapshot().Resources {
				if r.Kind == "Pod" && (r.Usage != nil) != tc.pod {
					t.Fatalf("pod aggregate: %+v", r.Usage)
				}
				if r.Kind == "Container" && r.Name == "app" && (r.Usage != nil) != tc.app {
					t.Fatalf("container sample: %+v", r.Usage)
				}
			}
		})
	}
}
