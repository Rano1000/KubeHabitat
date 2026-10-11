package cluster

import (
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func base(kind string, meta metav1.ObjectMeta, now time.Time) Resource {
	return Resource{ID: kind + ":" + string(meta.UID), UID: string(meta.UID), Kind: kind,
		Name: meta.Name, Namespace: meta.Namespace, ResourceVersion: meta.ResourceVersion,
		ObservedAt: now, State: "Unknown", Deleting: meta.DeletionTimestamp != nil}
}

func project(obj any, now time.Time) []Resource {
	switch value := obj.(type) {
	case *corev1.Node:
		r := base("Node", value.ObjectMeta, now)
		r.Details = map[string]string{}
		requests(value.Status.Capacity, "capacity ", r.Details)
		requests(value.Status.Allocatable, "allocatable ", r.Details)
		for _, c := range value.Status.Conditions {
			r.Conditions = append(r.Conditions, Condition{string(c.Type), string(c.Status), c.Reason})
			if c.Type == corev1.NodeReady {
				if c.Status != corev1.ConditionUnknown {
					ready := c.Status == corev1.ConditionTrue
					r.Ready = &ready
				}
				if c.Status == corev1.ConditionTrue {
					r.State = "Ready"
				} else if c.Status == corev1.ConditionFalse {
					r.State = "NotReady"
				}
			}
		}
		return []Resource{r}
	case *corev1.Namespace:
		r := base("Namespace", value.ObjectMeta, now)
		r.Labels = value.Labels
		r.Phase = string(value.Status.Phase)
		if r.Phase != "" {
			r.State = r.Phase
		}
		return []Resource{r}
	case *corev1.Pod:
		r := base("Pod", value.ObjectMeta, now)
		for _, owner := range value.OwnerReferences {
			if owner.Controller != nil && *owner.Controller {
				r.Owner = &Owner{UID: string(owner.UID), Kind: owner.Kind, Name: owner.Name}
				break
			}
		}
		r.Labels = value.Labels
		r.Phase, r.NodeName = string(value.Status.Phase), value.Spec.NodeName
		for _, c := range value.Status.Conditions {
			r.Conditions = append(r.Conditions, Condition{string(c.Type), string(c.Status), c.Reason})
			if c.Type == corev1.PodReady && c.Status != corev1.ConditionUnknown {
				ready := c.Status == corev1.ConditionTrue
				r.Ready = &ready
			}
		}
		switch {
		case r.Deleting:
			r.State = "Terminating"
		case r.Phase == "Succeeded":
			r.State = "Completed"
		case r.Phase == "Failed":
			r.State = "Failed"
		case r.NodeName == "":
			r.State = "Unscheduled"
		case r.Ready != nil && *r.Ready:
			r.State = "Ready"
		case r.Ready != nil:
			r.State = "NotReady"
		case r.Phase == "Pending":
			r.State = "Pending"
		}
		result := []Resource{r}
		addContainers := func(names []string, statuses []corev1.ContainerStatus, containerType string) {
			for _, name := range names {
				c := base("Container", value.ObjectMeta, now)
				c.ID, c.Name, c.Parent, c.NodeName, c.ContainerType = r.ID+"/"+containerType+"/"+name, name, r.ID, r.NodeName, containerType
				c.Details = map[string]string{}
				apply := func(spec corev1.Container) {
					if spec.Name != name {
						return
					}
					requests(spec.Resources.Requests, "request ", c.Details)
					requests(spec.Resources.Limits, "limit ", c.Details)
					for _, m := range spec.VolumeMounts {
						c.Links = append(c.Links, Link{Kind: "Volume", UID: r.ID + "/volume/" + m.Name, Relation: "volume mount"})
					}
					for _, p := range spec.Ports {
						if p.Name != "" {
							c.Details["port "+p.Name] = fmt.Sprintf("%s/%d", p.Protocol, p.ContainerPort)
						}
					}
				}
				for _, spec := range value.Spec.Containers {
					apply(spec)
				}
				for _, spec := range value.Spec.InitContainers {
					apply(spec)
				}
				for _, spec := range value.Spec.EphemeralContainers {
					apply(corev1.Container{Name: spec.Name, Ports: spec.Ports, VolumeMounts: spec.VolumeMounts})
				}
				for _, status := range statuses {
					if status.Name != name {
						continue
					}
					ready, restarts := status.Ready, status.RestartCount
					c.Ready, c.RestartCount = &ready, &restarts
					switch {
					case status.State.Waiting != nil:
						c.State, c.Reason = "Waiting", status.State.Waiting.Reason
					case status.State.Terminated != nil:
						c.State, c.Reason = "Terminated", status.State.Terminated.Reason
						code := status.State.Terminated.ExitCode
						c.ExitCode = &code
					case status.State.Running != nil:
						c.State = "Running"
					}
					break
				}
				result = append(result, c)
			}
		}
		var app, init, ephemeral []string
		for _, c := range value.Spec.Containers {
			app = append(app, c.Name)
		}
		for _, c := range value.Spec.InitContainers {
			init = append(init, c.Name)
		}
		for _, c := range value.Spec.EphemeralContainers {
			ephemeral = append(ephemeral, c.Name)
		}
		addContainers(app, value.Status.ContainerStatuses, "app")
		addContainers(init, value.Status.InitContainerStatuses, "init")
		addContainers(ephemeral, value.Status.EphemeralContainerStatuses, "ephemeral")
		result = append(result, podVolumes(value, r, now)...)
		return result
	}
	return projectTopology(obj, now)
}
