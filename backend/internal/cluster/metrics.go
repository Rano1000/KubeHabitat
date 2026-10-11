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
	nodes, pods := map[string]Resource{}, map[string]Resource{}
	children := map[string]map[string]Resource{}
	for _, r := range identities {
		switch r.Kind {
		case "Node":
			nodes[r.Name] = r
		case "Pod":
			pods[r.Namespace+"/"+r.Name] = r
		case "Container":
			if children[r.Parent] == nil {
				children[r.Parent] = map[string]Resource{}
			}
			children[r.Parent][r.Name] = r
		}
	}
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
			if apierrors.IsUnauthorized(err) {
				state.Reason = "Kubernetes credentials rejected or expired; usage is unknown"
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
			window, windowErr := time.ParseDuration(sample.Window)
			if err != nil || windowErr != nil || window <= 0 || time.Since(at) > 90*time.Second || time.Until(at) > 5*time.Second {
				continue
			}
			makeUsage := func(v core.ResourceList) (Usage, bool) {
				cpu, hasCPU := v[core.ResourceCPU]
				memory, hasMemory := v[core.ResourceMemory]
				if !hasCPU || !hasMemory || cpu.Sign() < 0 || memory.Sign() < 0 {
					return Usage{}, false
				}
				return Usage{CPUMilli: cpu.MilliValue(), MemoryBytes: memory.Value(), Timestamp: sample.Timestamp, Window: sample.Window}, true
			}
			r, exists := nodes[sample.Name]
			if kind == "pods" {
				r, exists = pods[sample.Namespace+"/"+sample.Name]
			}
			if !exists || (sample.UID != "" && string(sample.UID) != r.UID) || (r.CreatedAt != nil && at.Before(*r.CreatedAt)) {
				continue
			}
			if kind == "nodes" {
				if u, valid := makeUsage(sample.Usage); valid {
					usage[r.ID] = u
				}
				continue
			}
			total := Usage{Timestamp: sample.Timestamp, Window: sample.Window}
			seen := map[string]bool{}
			complete := len(sample.Containers) > 0
			for _, c := range sample.Containers {
				child, known := children[r.ID][c.Name]
				u, valid := makeUsage(c.Usage)
				if !known || !valid || seen[c.Name] {
					complete = false
					continue
				}
				seen[c.Name] = true
				usage[child.ID] = u
				total.CPUMilli += u.CPUMilli
				total.MemoryBytes += u.MemoryBytes
			}
			for name, child := range children[r.ID] {
				if (child.ContainerType == "app" || child.State == "Running") && !seen[name] {
					complete = false
				}
			}
			// A missing sidecar sample must not look like a complete pod total or measured zero.
			if complete {
				usage[r.ID] = total
			}
		}
	}
	s.mu.Lock()
	s.metrics = state
	s.usage = usage
	s.revision++
	s.mu.Unlock()
}
