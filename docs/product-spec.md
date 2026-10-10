# Product specification

![Cluster-house concept](assets/cluster-house-concept.png)

_Concept art for the intended product, rather than evidence that every pictured integration exists._

## Purpose

Give engineers a navigable spatial view of observed Kubernetes resources, their relationships, and
their changes. Connect visual symptoms to inspectable evidence so engineers can understand where to
investigate.

The product is an open-source web application intended for self-hosting alongside observability
tools. The first release should be useful to operators and understandable to learners, with a text
inventory alongside the 3D experience.

## Spatial model

| Representation    | Rule                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| Cluster house     | One cluster boundary; not itself a Kubernetes API resource           |
| Node room         | Hosts pods whose `spec.nodeName` matches the observed node           |
| Namespace overlay | Logical membership spanning node rooms                               |
| Pod shell         | API object with its own UID, phase, conditions, and container status |
| Container box     | Nested inside the pod; status comes from the pod API object          |
| Waiting area      | Unscheduled pods before an actual node assignment                    |
| Resource links    | Observed relationships; traffic requires separate telemetry          |

Memory usage, requests and limits, node capacity, and persistent storage are different concepts. A
volume is not a pod’s RAM. PVC-to-PV relationships and external storage belong to the dependency
layer; Azure integrations are optional connectors.

## Selection and navigation

1. List discovered supported resource kinds and instances in a searchable sidebar.
2. Selecting a kind highlights matching resources; selecting an instance focuses its object.
3. A guided camera shows the relevant room and component. Direct orbit and zoom remain available.
4. The inspector explains identity, current observations, freshness, ownership, and relationships.
5. Support keyboard selection, labelled states, pause controls, reduced motion, and text inspection
   when rendering fails.

Phase 01 implements this interaction against a small authored fixture. Real-cluster layout and
additional resource coverage belong to later phases.

## Lifecycle semantics

- **Running is not Ready.** Pod phase, readiness, container state, and application health remain
  distinct.
- Floating and rotation can represent an observed Ready condition. Decorative animation is not a
  health probe.
- `CrashLoopBackOff` is a container waiting reason, not a pod phase. A restart affects the inner
  container; the same pod UID can continue to exist.
- Replacement is a new observed pod UID. Do not animate a pod migrating between nodes when
  Kubernetes recreated it.
- Successful Job completion is a completed workload. Normal deletion or scale-down has a graceful
  transition.
- Broken pieces may become a temporary **historical failure marker** when confirmed failure is
  recorded. Preserve identity, timestamps, and provenance. History and debris are not implemented in
  Phase 01.
- Disconnected or stale data produces an unknown/stale state, not confirmed death or crash.

## Evidence and diagnostics

Every visual state needs an observable source: API field, condition, event, measured metric, or
supported traffic observation. Show the source and observation time in the inspector.

Explain confirmed symptoms such as explicit waiting reasons. Do not promise the underlying root
cause of every incident without investigation. Distinguish facts from inferred explanations. Logs
may be unavailable after deletion unless retained elsewhere.

Network topology does not prove traffic occurred. Animate traffic only from a configured observation
source; distinguish measured zero from absent telemetry. CPU/memory displays identify units, time
ranges, and measurement source.

## Trust boundaries

- Kubernetes credentials stay on the backend: local kubeconfig during development and scoped
  service-account permissions when deployed.
- Begin with read-only discovery. Treat logs and telemetry as explicit capabilities.
- Do not read Secret payloads merely to display an icon.
- Surface permission failures and partial visibility; do not substitute example resources for a live
  cluster.
- Cluster-changing actions are outside the initial scope.
- Phase 01 has no authentication or cluster adapter and defaults to localhost.

## Documentation quality

Use consistent branding, project-specific graphics, meaningful diagram labels, and short purposeful
animations. Keep commands reproducible. Separate concept art, demo screenshots, and live
functionality. Interactive documentation supplements readable Markdown; reduced-motion mode remains
usable.

## Phase 01 boundary

Deliver a runnable browser demo, Go health/status API, setup guides, contributor materials, source
licensing, and automated checks. Kubernetes discovery, live updates, incident history, traffic, and
production packaging follow the [roadmap](roadmap.md).
