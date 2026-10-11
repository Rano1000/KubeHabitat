# Delivery roadmap

![KubeHabitat target architecture](assets/architecture.svg)

States: **Planned → In progress → In review → Verified → Complete**. Acceptance evidence and
validation are required before marking a phase complete. Dates and percentages wait until actual
throughput supports estimates.

| Phase | Outcome                                           | State     |
| ----- | ------------------------------------------------- | --------- |
| 00    | Vision, name, first logo, visual direction        | Agreed    |
| 01    | Runnable foundation and contributor documentation | Verified  |
| 02    | Read-only live Kubernetes connection              | In review |
| 03    | Real cluster house and spatial navigation         | In review |
| 04    | Accurate workload lifecycle animations            | In review |
| 05    | Investigation and inspectable evidence            | Planned   |
| 06    | Metrics, ownership, services, storage             | Planned   |
| 07    | Optional observed traffic                         | Planned   |
| 08    | History, scale, accessibility                     | In review |
| 09    | Packaging, deployment, public release             | Planned   |

## 01 · Foundation

Deliver the Go service, browser shell, 3D demo, brand assets, contributor guides, and CI. Keep
resources explicitly disconnected from Kubernetes.

- [x] Document model, architecture, API boundary, and future phases.
- [x] Provide searchable fixtures, selection, guided focus, and details.
- [x] Provide pause, reduced motion, responsive layout, and rendering-error fallback.
- [x] Include the approved logo and project-specific graphics.
- [x] Verify clean frontend install/build, backend tests/build/vet, and browser checks.
- [x] Verify development proxy and compiled frontend served by Go.
- [x] Validate contributor templates, Markdown links, and repository hygiene.
- [x] Publish the foundation and verify GitHub CI.

The checklist records progress, not production readiness. See the
[Phase 01 delivery record](phase-01-delivery.md) for verification evidence. Development changes go
directly to `main` until public release. Pull requests open after release.

## 02 · Live Kubernetes connection

Implementation and automated verification are tracked in the
[Phase 02 delivery record](phase-02-delivery.md). See the
[live connection guide](live-connection.md) for setup. Real-cluster validation remains required
before closing the phase.

Read-only shared informers/cache for nodes, namespaces, pods, and derived containers. Design a
snapshot/update contract with identity, freshness, and recovery.

**Acceptance:** supported resources appear automatically; UID semantics are preserved; permission
failure, disconnect, reconnect, and resync are visible. No Secret payload is fetched for an icon.

## 03 · House generation and navigation

See the [Phase 03 delivery record](phase-03-delivery.md). Initial network, storage and Metrics API
layers are also available for review at the user's request; later-phase acceptance remains open.

Progressive scale navigation was brought forward at the user's request. See the
[large-cluster exploration guide](large-clusters.md) for grouped workloads, replica pages,
application scope, investigation shortcuts, activity and validation limits.

Generate rooms and placements from observations. Show namespaces across rooms and unscheduled pods
in a waiting area. Synchronize inventory, highlighting, guided camera, and inspector.

**Acceptance:** real objects are individually selectable by keyboard or scene interaction; changing
cluster size preserves navigation; namespace membership remains accurate across nodes.

## 04 · Lifecycle animation

See the [Phase 04 delivery record](phase-04-delivery.md) and
[lifecycle evidence guide](lifecycle.md). Initial state markers, termination evidence and observed
restart deltas are implemented; recorded replacement timelines and persistent failure history remain
open.

Represent readiness, container waiting/restarts, pod failure, replacement, completion, deletion, and
unknown states. Historical failure markers require recorded confirmed failures.

**Acceptance:** fixtures and a test cluster demonstrate lifecycle distinctions without inventing
replacements or treating completion as a crash. Pause/reduced motion preserve information.

**Alpha gate:** live exploration and accurate initial lifecycle signals, with limitations
documented.

## 05 · Investigation

Attach conditions, events, and retrievable logs. Explain confirmed symptoms, label inference, and
show provenance/freshness.

**Acceptance:** supported warnings lead to evidence; deleted logs and permissions are explicit; no
unverified cause is presented as fact.

## 06 · Metrics and dependencies

Integrate CPU/memory separately from requests, limits, and capacity. Add owners,
services/EndpointSlices, PVC/PV links, and optional external storage.

**Acceptance:** units, time ranges, relationships, and availability are inspectable. Missing metrics
differ from measured zero usage.

**Beta gate:** evidence-backed investigation and dependencies, validated on representative clusters.

## 07 · Observed traffic

Integrate optional telemetry such as Hubble or traces when it provides relevant flow evidence.
Animate only observed traffic.

**Acceptance:** source, time window, and availability are visible. Topology-only mode, measured zero
traffic, and missing telemetry differ.

## 08 · History, performance, accessibility

Record observations with retention, gaps, and replay. Add grouping, rendering budgets, level of
detail, and text alternatives.

**Acceptance:** replay never fills gaps with invented events; representative sizes meet published
budgets; keyboard and reduced-motion workflows are reviewed.

## 09 · Deployment and release

Ship reproducible images, Helm, authentication, scoped RBAC, upgrades, release notes, polished
documentation, and a public demo with authored data.

**Acceptance:** fresh installs and upgrades work; operational limitations are documented; artifacts
are reproducible; a supported feature matrix is published.

**Stable gate:** supported installation, useful monitoring workflows, validated semantics, and
reviewed operational controls.
