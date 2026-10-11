// Package cluster projects read-only Kubernetes observations into a credential-free API.
package cluster

import "time"

type Condition struct {
	Type   string `json:"type"`
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
}

// Termination is status evidence, never a log or a termination message.
type Termination struct {
	Reason     string     `json:"reason,omitempty"`
	ExitCode   int32      `json:"exitCode"`
	StartedAt  *time.Time `json:"startedAt,omitempty"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
}

// Resource contains only the fields needed for inventory and visual state.
// Pod specs, environment variables, annotations, and Secret payloads are never serialized.
type Resource struct {
	ID              string            `json:"id"`
	UID             string            `json:"uid"`
	Kind            string            `json:"kind"`
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace,omitempty"`
	NodeName        string            `json:"nodeName,omitempty"`
	Parent          string            `json:"parent,omitempty"`
	ResourceVersion string            `json:"resourceVersion"`
	ObservedAt      time.Time         `json:"observedAt"`
	Phase           string            `json:"phase,omitempty"`
	State           string            `json:"state"`
	Ready           *bool             `json:"ready,omitempty"`
	RestartCount    *int32            `json:"restartCount,omitempty"`
	ContainerType   string            `json:"containerType,omitempty"`
	Reason          string            `json:"reason,omitempty"`
	ExitCode        *int32            `json:"exitCode,omitempty"`
	StartedAt       *time.Time        `json:"startedAt,omitempty"`
	Termination     *Termination      `json:"termination,omitempty"`
	LastTermination *Termination      `json:"lastTermination,omitempty"`
	Deleting        bool              `json:"deleting,omitempty"`
	Conditions      []Condition       `json:"conditions,omitempty"`
	Labels          map[string]string `json:"labels,omitempty"`
	Owner           *Owner            `json:"owner,omitempty"`
	Details         map[string]string `json:"details,omitempty"`
	Links           []Link            `json:"links,omitempty"`
	Policy          *Policy           `json:"policy,omitempty"`
	Usage           *Usage            `json:"usage,omitempty"`
}

// Owner is the observed controlling reference, not an inferred Deployment.
type Owner struct {
	UID  string `json:"uid"`
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type Link struct {
	Kind      string `json:"kind"`
	Name      string `json:"name,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	UID       string `json:"uid,omitempty"`
	Relation  string `json:"relation"`
}
type Usage struct {
	CPUMilli    int64  `json:"cpuMilli"`
	MemoryBytes int64  `json:"memoryBytes"`
	Timestamp   string `json:"timestamp"`
	Window      string `json:"window"`
}
type Telemetry struct {
	State  string `json:"state"`
	Reason string `json:"reason"`
}

type Visibility struct {
	Kind        string     `json:"kind"`
	State       string     `json:"state"`
	Synced      bool       `json:"synced"`
	LastSuccess *time.Time `json:"lastSuccess,omitempty"`
	Reason      string     `json:"reason,omitempty"`
}

// Snapshot is a full cache replacement, not an incident history or an incremental patch.
type Snapshot struct {
	SchemaVersion int          `json:"schemaVersion"`
	SessionID     string       `json:"sessionId"`
	Revision      uint64       `json:"revision"`
	GeneratedAt   time.Time    `json:"generatedAt"`
	DataSource    string       `json:"dataSource"`
	Cluster       string       `json:"cluster"`
	Connection    string       `json:"connection"`
	Visibility    []Visibility `json:"visibility"`
	Resources     []Resource   `json:"resources"`
	Metrics       Telemetry    `json:"metrics"`
}
