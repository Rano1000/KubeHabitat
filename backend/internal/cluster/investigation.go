package cluster

import (
	"context"
	"io"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/client-go/kubernetes"
)

const LogByteLimit int64 = 64 * 1024
const LogTailLines int64 = 200
const LogSinceSeconds int64 = 15 * 60

type EvidenceStatus struct {
	State  string `json:"state"`
	Reason string `json:"reason"`
}
type ReportedEvent struct {
	UID          string     `json:"uid"`
	Type         string     `json:"type"`
	Reason       string     `json:"reason"`
	Message      string     `json:"message"`
	Count        int32      `json:"count"`
	LastObserved *time.Time `json:"lastObserved,omitempty"`
	Reporter     string     `json:"reporter,omitempty"`
	FieldPath    string     `json:"fieldPath,omitempty"`
}
type EventEvidence struct {
	EvidenceStatus
	Items   []ReportedEvent `json:"items"`
	Limited bool            `json:"limited"`
}
type Investigation struct {
	ResourceID  string         `json:"resourceId"`
	TargetUID   string         `json:"targetUid,omitempty"`
	Scope       string         `json:"scope"`
	ObservedAt  time.Time      `json:"observedAt"`
	Source      string         `json:"source"`
	Target      EvidenceStatus `json:"target"`
	Events      EventEvidence  `json:"events"`
	LogsEnabled bool           `json:"logsEnabled"`
}
type LogEvidence struct {
	EvidenceStatus
	ResourceID   string    `json:"resourceId"`
	PodUID       string    `json:"podUid,omitempty"`
	ObservedAt   time.Time `json:"observedAt"`
	Source       string    `json:"source"`
	Previous     bool      `json:"previous"`
	Text         string    `json:"text,omitempty"`
	Truncated    bool      `json:"truncated"`
	TailLines    int64     `json:"tailLines"`
	SinceSeconds int64     `json:"sinceSeconds"`
	ByteLimit    int64     `json:"byteLimit"`
}

// Log reads are separately enabled and never run during snapshot polling.
func (s *Store) ConfigureInvestigation(client kubernetes.Interface, logsEnabled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.evidenceClient, s.logsEnabled = client, logsEnabled
	s.logReader = func(ctx context.Context, ns, pod string, opts *corev1.PodLogOptions) (io.ReadCloser, error) {
		return client.CoreV1().Pods(ns).GetLogs(pod, opts).Stream(ctx)
	}
}

func (s *Store) evidenceResource(id string) (Resource, Resource, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, values := range s.objects {
		for _, r := range values {
			if r.ID != id {
				continue
			}
			if r.Kind == "Container" || r.Kind == "Volume" {
				for _, parent := range s.objects[r.Parent] {
					if parent.Kind == "Pod" {
						return r, parent, true
					}
				}
				return Resource{}, Resource{}, false
			}
			return r, r, true
		}
	}
	return Resource{}, Resource{}, false
}

func unavailableEvidence(err error, logs bool) EvidenceStatus {
	switch {
	case apierrors.IsForbidden(err), apierrors.IsUnauthorized(err):
		return EvidenceStatus{"denied", "Kubernetes denied this evidence read; check the observer permissions."}
	case apierrors.IsNotFound(err):
		return EvidenceStatus{"missing", "The requested object or retained evidence is no longer available."}
	case logs && apierrors.IsBadRequest(err):
		return EvidenceStatus{"unavailable", "This container run has no retrievable logs. It may not have started, or its previous logs may no longer be retained."}
	default:
		return EvidenceStatus{"unavailable", "Kubernetes evidence could not be retrieved. Retry after checking connectivity."}
	}
}

func podIdentity(ctx context.Context, client kubernetes.Interface, target Resource) EvidenceStatus {
	if target.Kind != "Pod" {
		return EvidenceStatus{"available", "Events are matched to this observed object UID."}
	}
	pod, err := client.CoreV1().Pods(target.Namespace).Get(ctx, target.Name, metav1.GetOptions{})
	if err != nil {
		return unavailableEvidence(err, false)
	}
	if string(pod.UID) != target.UID {
		return EvidenceStatus{"replaced", "The pod name now belongs to a different UID. Logs from that replacement are not shown."}
	}
	return EvidenceStatus{"available", "Kubernetes confirmed the selected pod UID."}
}

// Event messages and log bodies are deliberate on-demand evidence, never snapshot fields.
// Strip terminal controls; render them as plain text in the browser.
func evidenceText(value string, limit int) string {
	value = strings.ToValidUTF8(value, "�")
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			return -1
		}
		return r
	}, value)
	if len(value) > limit {
		value = value[:limit]
		for !utf8.ValidString(value) {
			value = value[:len(value)-1]
		}
	}
	return value
}

func (s *Store) Investigate(ctx context.Context, id string) Investigation {
	result := Investigation{ResourceID: id, ObservedAt: time.Now().UTC(), Source: "Kubernetes API",
		Target: EvidenceStatus{"missing", "Selected identity is no longer in the observer cache."},
		Events: EventEvidence{EvidenceStatus: EvidenceStatus{"unavailable", "No target identity is available."}, Items: []ReportedEvent{}}}
	_, target, found := s.evidenceResource(id)
	if !found {
		return result
	}
	result.TargetUID = target.UID
	result.Scope = target.Kind + " " + target.Name
	if target.Namespace != "" {
		result.Scope = target.Namespace + "/" + result.Scope
	}
	s.mu.RLock()
	client, enabled := s.evidenceClient, s.logsEnabled
	s.mu.RUnlock()
	result.LogsEnabled = enabled
	if client == nil {
		result.Target = EvidenceStatus{"unavailable", "Investigation client is not configured."}
		return result
	}
	result.Target = podIdentity(ctx, client, target)
	list, err := client.CoreV1().Events(target.Namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fields.OneTermEqualSelector("involvedObject.uid", target.UID).String(), Limit: 100,
	})
	if err != nil {
		result.Events.EvidenceStatus = unavailableEvidence(err, false)
		return result
	}
	result.Events.EvidenceStatus = EvidenceStatus{"available", "Reported Kubernetes events for this exact UID; retention is controlled by the cluster."}
	result.Events.Limited = list.Continue != ""
	for _, event := range list.Items {
		if string(event.InvolvedObject.UID) != target.UID || (target.Namespace != "" && event.Namespace != target.Namespace) {
			continue
		}
		last := event.LastTimestamp.Time
		count := event.Count
		if event.Series != nil {
			last, count = event.Series.LastObservedTime.Time, event.Series.Count
		}
		if last.IsZero() {
			last = event.EventTime.Time
		}
		if last.IsZero() {
			last = event.CreationTimestamp.Time
		}
		var at *time.Time
		if !last.IsZero() {
			stamp := last.UTC()
			at = &stamp
		}
		if count < 1 {
			count = 1
		}
		reporter := event.ReportingController
		if reporter == "" {
			reporter = event.Source.Component
		}
		result.Events.Items = append(result.Events.Items, ReportedEvent{
			UID: string(event.UID), Type: evidenceText(event.Type, 128), Reason: evidenceText(event.Reason, 256),
			Message: evidenceText(event.Message, 2048), Count: count, LastObserved: at,
			Reporter: evidenceText(reporter, 256), FieldPath: evidenceText(event.InvolvedObject.FieldPath, 256),
		})
	}
	sort.SliceStable(result.Events.Items, func(i, j int) bool {
		a, b := result.Events.Items[i].LastObserved, result.Events.Items[j].LastObserved
		if a == nil {
			return false
		}
		if b == nil {
			return true
		}
		return a.After(*b)
	})
	if len(result.Events.Items) > 30 {
		result.Events.Items = result.Events.Items[:30]
		result.Events.Limited = true
	}
	return result
}

func (s *Store) ReadLogs(ctx context.Context, id string, previous bool) LogEvidence {
	result := LogEvidence{ResourceID: id, ObservedAt: time.Now().UTC(), Source: "Kubernetes pods/log",
		Previous: previous, TailLines: LogTailLines, SinceSeconds: LogSinceSeconds, ByteLimit: LogByteLimit,
		EvidenceStatus: EvidenceStatus{"missing", "Selected identity is no longer in the observer cache."}}
	resource, pod, found := s.evidenceResource(id)
	if !found {
		return result
	}
	result.PodUID = pod.UID
	if resource.Kind != "Container" || pod.Kind != "Pod" {
		result.EvidenceStatus = EvidenceStatus{"unsupported", "Select a specific container to read its logs."}
		return result
	}
	s.mu.RLock()
	client, enabled, reader := s.evidenceClient, s.logsEnabled, s.logReader
	s.mu.RUnlock()
	if !enabled {
		result.EvidenceStatus = EvidenceStatus{"disabled", "Container log access is disabled. Start the backend with -allow-logs and grant get on pods/log."}
		return result
	}
	if client == nil || reader == nil {
		result.EvidenceStatus = EvidenceStatus{"unavailable", "Investigation client is not configured."}
		return result
	}
	result.EvidenceStatus = podIdentity(ctx, client, pod)
	if result.State != "available" {
		return result
	}
	tail, since, limit := LogTailLines, LogSinceSeconds, LogByteLimit
	stream, err := reader(ctx, pod.Namespace, pod.Name, &corev1.PodLogOptions{Container: resource.Name, Previous: previous, Timestamps: true, TailLines: &tail, SinceSeconds: &since, LimitBytes: &limit})
	if err != nil {
		result.EvidenceStatus = unavailableEvidence(err, true)
		return result
	}
	defer stream.Close()
	body, err := io.ReadAll(io.LimitReader(stream, LogByteLimit+1))
	if err != nil {
		result.EvidenceStatus = unavailableEvidence(err, true)
		return result
	}
	// The name-addressed logs API has no UID precondition. Verify again after retrieval.
	result.EvidenceStatus = podIdentity(ctx, client, pod)
	if result.State != "available" {
		return result
	}
	result.Truncated = int64(len(body)) >= LogByteLimit
	result.Text = evidenceText(string(body), int(LogByteLimit))
	result.EvidenceStatus = EvidenceStatus{"available", "A bounded log snapshot for the selected container run; this is not a continuous stream."}
	return result
}
