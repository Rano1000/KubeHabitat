package cluster

import (
	"crypto/rand"
	"encoding/hex"
	"sort"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/tools/cache"
)

type Store struct {
	mu            sync.RWMutex
	name, session string
	revision      uint64
	objects       map[string][]Resource
	visibility    map[string]Visibility
	informers     map[string]cache.SharedIndexInformer
	metrics       Telemetry
	usage         map[string]Usage
}

func NewStore(name string) *Store {
	var token [16]byte
	if _, err := rand.Read(token[:]); err != nil {
		panic(err)
	}
	s := &Store{name: name, session: hex.EncodeToString(token[:]), objects: map[string][]Resource{}, visibility: map[string]Visibility{}, informers: map[string]cache.SharedIndexInformer{}}
	s.metrics = Telemetry{State: "unavailable", Reason: "Metrics API has not been observed"}
	s.usage = map[string]Usage{}
	for _, kind := range observedKinds {
		s.visibility[kind] = Visibility{Kind: kind, State: "connecting"}
	}
	return s
}

func (s *Store) observe(obj any) {
	values := project(obj, time.Now().UTC())
	if len(values) == 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[values[0].ID] = values
	s.revision++
}

func (s *Store) remove(obj any) {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tombstone.Obj
	}
	values := project(obj, time.Now().UTC())
	if len(values) == 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.objects, values[0].ID)
	s.revision++
}

func (s *Store) update(previous, current any) {
	oldValues, newValues := project(previous, time.Now().UTC()), project(current, time.Now().UTC())
	if len(oldValues) > 0 && len(newValues) > 0 && oldValues[0].ID != newValues[0].ID {
		s.remove(previous)
	}
	s.observe(current)
}

// Public errors are categories: API response text can contain sensitive cluster details.
func (s *Store) transport(kind string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v := s.visibility[kind]
	if err == nil {
		now := time.Now().UTC()
		v.LastSuccess = &now
		v.State, v.Reason = "observing", ""
	} else {
		if v.State == "denied" && !apierrors.IsForbidden(err) && !apierrors.IsUnauthorized(err) {
			return
		}
		v.State, v.Reason = "reconnecting", "API connection interrupted; cached observations may be stale"
		if apierrors.IsForbidden(err) || apierrors.IsUnauthorized(err) {
			v.State, v.Reason = "denied", "Read access denied for this resource kind"
		}
	}
	s.visibility[kind] = v
	s.revision++
}

func (s *Store) verify(kind string, err error) {
	if err != nil {
		s.transport(kind, err)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	v := s.visibility[kind]
	now := time.Now().UTC()
	v.LastSuccess = &now
	// A successful LIST must not erase a denied or disconnected WATCH.
	s.visibility[kind] = v
}

func (s *Store) Snapshot() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now().UTC()
	result := Snapshot{SchemaVersion: 1, SessionID: s.session, Revision: s.revision, GeneratedAt: now,
		DataSource: "kubernetes", Cluster: s.name, Connection: "connected", Resources: []Resource{}, Visibility: []Visibility{}}
	result.Metrics = s.metrics
	for _, kind := range observedKinds {
		v := s.visibility[kind]
		if informer := s.informers[kind]; informer != nil {
			v.Synced = informer.HasSynced()
		}
		if v.LastSuccess != nil && now.Sub(*v.LastSuccess) > 45*time.Second && v.State == "observing" {
			v.State, v.Reason = "stale", "API verification is older than 45 seconds"
		}
		if !v.Synced && v.State == "observing" {
			v.State = "connecting"
		}
		if v.State != "observing" {
			result.Connection = "partial"
		}
		result.Visibility = append(result.Visibility, v)
	}
	allUnavailable := true
	for _, v := range result.Visibility {
		if v.State == "observing" {
			allUnavailable = false
		}
	}
	if allUnavailable {
		result.Connection = "disconnected"
	}
	for _, values := range s.objects {
		for _, r := range values {
			if u, ok := s.usage[r.ID]; ok && s.metrics.State == "observing" {
				sample, _ := time.Parse(time.RFC3339, u.Timestamp)
				if now.Sub(sample) <= 90*time.Second {
					r.Usage = &u
				}
			}
			result.Resources = append(result.Resources, r)
		}
	}
	sort.Slice(result.Resources, func(i, j int) bool { return result.Resources[i].ID < result.Resources[j].ID })
	return result
}
