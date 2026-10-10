package cluster

import (
	"fmt"
	core "k8s.io/api/core/v1"
	discovery "k8s.io/api/discovery/v1"
	network "k8s.io/api/networking/v1"
	storage "k8s.io/api/storage/v1"
	"time"
)

type Policy = network.NetworkPolicySpec

var observedKinds = []string{"Node", "Namespace", "Pod", "Service", "EndpointSlice", "Ingress", "NetworkPolicy", "PersistentVolumeClaim", "PersistentVolume", "StorageClass", "ResourceQuota"}

func requests(r core.ResourceList, prefix string, details map[string]string) {
	for _, key := range []core.ResourceName{core.ResourceCPU, core.ResourceMemory, core.ResourceEphemeralStorage, core.ResourceStorage} {
		if q, ok := r[key]; ok {
			details[prefix+string(key)] = q.String()
		}
	}
}

func projectTopology(obj any, now time.Time) []Resource {
	switch v := obj.(type) {
	case *core.Service:
		r := base("Service", v.ObjectMeta, now)
		r.State = "Configured"
		r.Details = map[string]string{"type": string(v.Spec.Type), "clusterIP": v.Spec.ClusterIP}
		for i, p := range v.Spec.Ports {
			r.Details[fmt.Sprintf("port %d", i+1)] = fmt.Sprintf("%s %d → %s", p.Protocol, p.Port, p.TargetPort.String())
		}
		return []Resource{r}
	case *discovery.EndpointSlice:
		r := base("EndpointSlice", v.ObjectMeta, now)
		r.State = "Observed"
		r.Details = map[string]string{"addressType": string(v.AddressType)}
		if name := v.Labels[discovery.LabelServiceName]; name != "" {
			r.Links = append(r.Links, Link{Kind: "Service", Name: name, Namespace: v.Namespace, Relation: "service endpoints"})
		}
		for _, e := range v.Endpoints {
			if e.TargetRef != nil && e.TargetRef.Kind == "Pod" {
				state := "endpoint readiness unknown"
				if e.Conditions.Ready != nil {
					if *e.Conditions.Ready {
						state = "ready endpoint"
					} else {
						state = "not-ready endpoint"
					}
				}
				r.Links = append(r.Links, Link{Kind: "Pod", Name: e.TargetRef.Name, Namespace: e.TargetRef.Namespace, UID: string(e.TargetRef.UID), Relation: state})
			}
		}
		return []Resource{r}
	case *network.Ingress:
		r := base("Ingress", v.ObjectMeta, now)
		r.State = "Configured"
		r.Details = map[string]string{}
		if v.Spec.IngressClassName != nil {
			r.Details["ingressClass"] = *v.Spec.IngressClassName
		}
		add := func(b network.IngressBackend) {
			if b.Service != nil {
				r.Links = append(r.Links, Link{Kind: "Service", Name: b.Service.Name, Namespace: v.Namespace, Relation: "configured ingress route"})
			}
		}
		if v.Spec.DefaultBackend != nil {
			add(*v.Spec.DefaultBackend)
		}
		for _, rule := range v.Spec.Rules {
			if rule.HTTP != nil {
				for _, p := range rule.HTTP.Paths {
					add(p.Backend)
				}
			}
		}
		return []Resource{r}
	case *network.NetworkPolicy:
		r := base("NetworkPolicy", v.ObjectMeta, now)
		r.State = "Configured"
		p := v.Spec.DeepCopy()
		r.Policy = p
		return []Resource{r}
	case *core.PersistentVolumeClaim:
		r := base("PersistentVolumeClaim", v.ObjectMeta, now)
		r.State = string(v.Status.Phase)
		r.Details = map[string]string{}
		requests(v.Spec.Resources.Requests, "requested ", r.Details)
		requests(v.Status.Capacity, "capacity ", r.Details)
		if v.Spec.StorageClassName != nil {
			r.Links = append(r.Links, Link{Kind: "StorageClass", Name: *v.Spec.StorageClassName, Relation: "storage class"})
		}
		if v.Spec.VolumeName != "" {
			r.Links = append(r.Links, Link{Kind: "PersistentVolume", Name: v.Spec.VolumeName, Relation: "bound volume"})
		}
		return []Resource{r}
	case *core.PersistentVolume:
		r := base("PersistentVolume", v.ObjectMeta, now)
		r.State = string(v.Status.Phase)
		r.Details = map[string]string{"reclaimPolicy": string(v.Spec.PersistentVolumeReclaimPolicy)}
		requests(v.Spec.Capacity, "capacity ", r.Details)
		if v.Spec.StorageClassName != "" {
			r.Links = append(r.Links, Link{Kind: "StorageClass", Name: v.Spec.StorageClassName, Relation: "storage class"})
		}
		// Node paths, CSI volume handles, and provider credentials are deliberately excluded.
		return []Resource{r}
	case *storage.StorageClass:
		r := base("StorageClass", v.ObjectMeta, now)
		r.State = "Configured"
		r.Details = map[string]string{"provisioner": v.Provisioner}
		if v.VolumeBindingMode != nil {
			r.Details["bindingMode"] = string(*v.VolumeBindingMode)
		}
		return []Resource{r}
	case *core.ResourceQuota:
		r := base("ResourceQuota", v.ObjectMeta, now)
		r.State = "Observed"
		r.Details = map[string]string{}
		for k, q := range v.Status.Hard {
			r.Details["quota "+string(k)] = q.String()
		}
		for k, q := range v.Status.Used {
			r.Details["quota accounted "+string(k)] = q.String()
		}
		return []Resource{r}
	}
	return nil
}

func podVolumes(v *core.Pod, parent Resource, now time.Time) []Resource {
	var result []Resource
	for _, volume := range v.Spec.Volumes {
		// Secret and ConfigMap volumes contain no serialized payload or source reference.
		r := base("Volume", v.ObjectMeta, now)
		r.ID = parent.ID + "/volume/" + volume.Name
		r.Name = volume.Name
		r.Parent = parent.ID
		r.NodeName = parent.NodeName
		r.State = "Configured"
		r.Details = map[string]string{}
		switch {
		case volume.PersistentVolumeClaim != nil:
			r.Details["type"] = "PersistentVolumeClaim"
			r.Links = append(r.Links, Link{Kind: "PersistentVolumeClaim", Name: volume.PersistentVolumeClaim.ClaimName, Namespace: v.Namespace, Relation: "claim reference"})
		case volume.EmptyDir != nil:
			r.Details["type"] = "emptyDir"
			r.Details["medium"] = string(volume.EmptyDir.Medium)
			if r.Details["medium"] == "" {
				r.Details["medium"] = "node disk"
			}
			if volume.EmptyDir.SizeLimit != nil {
				r.Details["size limit"] = volume.EmptyDir.SizeLimit.String()
			}
		case volume.Secret != nil:
			r.Details["type"] = "Secret mount (payload hidden)"
		case volume.ConfigMap != nil:
			r.Details["type"] = "ConfigMap mount (payload hidden)"
		case volume.Projected != nil:
			r.Details["type"] = "Projected mount (sources hidden)"
		default:
			r.Details["type"] = "Other volume (source hidden)"
		}
		result = append(result, r)
	}
	return result
}
