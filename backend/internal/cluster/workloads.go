package cluster

import (
	apps "k8s.io/api/apps/v1"
	batch "k8s.io/api/batch/v1"
	core "k8s.io/api/core/v1"
	"strconv"
	"time"
)

// Project status and controlling identity only; never serialize a workload's pod template.
func projectWorkload(obj any, now time.Time) []Resource {
	var r Resource
	replicas := func(desired *int32) int32 {
		if desired == nil {
			return 1
		}
		return *desired
	}
	setReplicas := func(desired, ready, updated int32, generation, observed int64) {
		r.Details = map[string]string{"desired replicas": strconv.Itoa(int(desired)), "ready replicas": strconv.Itoa(int(ready)), "updated replicas": strconv.Itoa(int(updated)), "generation": strconv.FormatInt(generation, 10), "observed generation": strconv.FormatInt(observed, 10)}
		r.State = "Reconciling"
		if observed >= generation {
			if desired == 0 {
				r.State = "ScaledToZero"
			} else if ready >= desired && updated >= desired {
				r.State = "Ready"
			}
		}
	}
	switch v := obj.(type) {
	case *apps.Deployment:
		r = base("Deployment", v.ObjectMeta, now)
		setReplicas(replicas(v.Spec.Replicas), v.Status.ReadyReplicas, v.Status.UpdatedReplicas, v.Generation, v.Status.ObservedGeneration)
		for _, c := range v.Status.Conditions {
			r.Conditions = append(r.Conditions, Condition{string(c.Type), string(c.Status), c.Reason})
			if v.Status.ObservedGeneration >= v.Generation && c.Type == apps.DeploymentProgressing && c.Status == core.ConditionFalse {
				r.State, r.Reason = "Degraded", c.Reason
			}
		}
	case *apps.ReplicaSet:
		r = base("ReplicaSet", v.ObjectMeta, now)
		setReplicas(replicas(v.Spec.Replicas), v.Status.ReadyReplicas, v.Status.FullyLabeledReplicas, v.Generation, v.Status.ObservedGeneration)
		for _, c := range v.Status.Conditions {
			r.Conditions = append(r.Conditions, Condition{string(c.Type), string(c.Status), c.Reason})
		}
	case *apps.StatefulSet:
		r = base("StatefulSet", v.ObjectMeta, now)
		setReplicas(replicas(v.Spec.Replicas), v.Status.ReadyReplicas, v.Status.UpdatedReplicas, v.Generation, v.Status.ObservedGeneration)
	case *apps.DaemonSet:
		r = base("DaemonSet", v.ObjectMeta, now)
		setReplicas(v.Status.DesiredNumberScheduled, v.Status.NumberReady, v.Status.UpdatedNumberScheduled, v.Generation, v.Status.ObservedGeneration)
	case *batch.Job:
		r = base("Job", v.ObjectMeta, now)
		r.State = "Pending"
		r.Details = map[string]string{"active pods": strconv.Itoa(int(v.Status.Active)), "succeeded pods": strconv.Itoa(int(v.Status.Succeeded)), "failed pod attempts": strconv.Itoa(int(v.Status.Failed))}
		if v.Status.Active > 0 {
			r.State = "Active"
		}
		for _, c := range v.Status.Conditions {
			r.Conditions = append(r.Conditions, Condition{string(c.Type), string(c.Status), c.Reason})
			if c.Status == core.ConditionTrue && (c.Type == batch.JobComplete || c.Type == batch.JobFailed) {
				if c.Type == batch.JobComplete {
					r.State = "Completed"
				} else {
					r.State = "Failed"
				}
				r.Reason = c.Reason
			}
		}
	case *batch.CronJob:
		r = base("CronJob", v.ObjectMeta, now)
		r.State = "Configured"
		if v.Spec.Suspend != nil && *v.Spec.Suspend {
			r.State = "Suspended"
		}
		r.Details = map[string]string{"schedule": v.Spec.Schedule, "active jobs": strconv.Itoa(len(v.Status.Active))}
		if v.Spec.TimeZone != nil {
			r.Details["time zone"] = *v.Spec.TimeZone
		}
		if v.Status.LastScheduleTime != nil {
			r.Details["last scheduled"] = v.Status.LastScheduleTime.UTC().Format(time.RFC3339)
		}
	default:
		return nil
	}
	if r.Deleting {
		r.State = "Terminating"
	}
	// Labels remain explicit application grouping evidence, not inferred ownership.
	switch v := obj.(type) {
	case *apps.Deployment:
		r.Labels = v.Labels
	case *apps.ReplicaSet:
		r.Labels = v.Labels
	case *apps.StatefulSet:
		r.Labels = v.Labels
	case *apps.DaemonSet:
		r.Labels = v.Labels
	case *batch.Job:
		r.Labels = v.Labels
	case *batch.CronJob:
		r.Labels = v.Labels
	}
	return []Resource{r}
}
