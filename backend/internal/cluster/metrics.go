package cluster

import (
	"context"
	"encoding/json"
	core "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/rest"
	"time"
)

type metricObject struct {
	metav1.ObjectMeta `json:"metadata"`
	Timestamp         string            `json:"timestamp"`
	Window            string            `json:"window"`
	Usage             core.ResourceList `json:"usage"`
	Containers        []struct {
		Name  string            `json:"name"`
		Usage core.ResourceList `json:"usage"`
	} `json:"containers"`
}

// Metrics API samples are optional. No kubelet proxy, write permission, or synthetic usage.
func (s *Store) StartMetrics(ctx context.Context, client rest.Interface) {
	if client == nil {
		return
	}
	go func() {
		for {
			s.pollMetrics(ctx, client)
			select {
			case <-ctx.Done():
				return
			case <-time.After(15 * time.Second):
			}
		}
	}()
}

func (s *Store) pollMetrics(ctx context.Context, client rest.Interface) {
	// Bind samples to the currently observed UID, not a later object with the same name.
	identities := s.Snapshot().Resources
	usage := map[string]Usage{}
	state := Telemetry{State: "observing", Reason: "Kubernetes Metrics API · CPU and memory working set"}
	for _, kind := range []string{"nodes", "pods"} {
		probe, cancel := context.WithTimeout(ctx, 5*time.Second)
		raw, err := client.Get().AbsPath("/apis/metrics.k8s.io/v1beta1/" + kind).DoRaw(probe)
		cancel()
		if err != nil {
			state = Telemetry{State: "unavailable", Reason: "Metrics API unavailable; usage is unknown"}
			if apierrors.IsForbidden(err) || apierrors.IsUnauthorized(err) {
				state = Telemetry{State: "denied", Reason: "Metrics API read access denied"}
			}
			usage = map[string]Usage{}
			break
		}
		var list struct {
			Items []metricObject `json:"items"`
		}
		if json.Unmarshal(raw, &list) != nil {
			state = Telemetry{State: "unavailable", Reason: "Metrics API returned an unsupported sample"}
			usage = map[string]Usage{}
			break
		}
		for _, sample := range list.Items {
			at, err := time.Parse(time.RFC3339, sample.Timestamp)
			if err != nil || time.Since(at) > 90*time.Second || time.Until(at) > 5*time.Second {
				continue
			}
			makeUsage := func(v core.ResourceList) Usage {
				cpu, memory := v[core.ResourceCPU], v[core.ResourceMemory]
				return Usage{CPUMilli: cpu.MilliValue(), MemoryBytes: memory.Value(), Timestamp: sample.Timestamp, Window: sample.Window}
			}
			for _, r := range identities {
				if kind == "nodes" && r.Kind == "Node" && r.Name == sample.Name {
					usage[r.ID] = makeUsage(sample.Usage)
				}
				if kind == "pods" && r.Kind == "Pod" && r.Name == sample.Name && r.Namespace == sample.Namespace {
					total := Usage{Timestamp: sample.Timestamp, Window: sample.Window}
					for _, c := range sample.Containers {
						u := makeUsage(c.Usage)
						total.CPUMilli += u.CPUMilli
						total.MemoryBytes += u.MemoryBytes
						for _, child := range identities {
							if child.Kind == "Container" && child.Parent == r.ID && child.Name == c.Name {
								usage[child.ID] = u
							}
						}
					}
					usage[r.ID] = total
				}
			}
		}
	}
	s.mu.Lock()
	s.metrics = state
	s.usage = usage
	s.revision++
	s.mu.Unlock()
}
