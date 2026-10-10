# Architecture

![Target data flow](assets/architecture.svg)

## Current foundation

Phase 02 extends this foundation with opt-in live discovery. See
[Live connection](live-connection.md) for the implemented contract and trust boundary. The
foundation description below records the separate authored demo; it does not describe the live
inventory.

React, TypeScript, and Vite provide the browser shell. A lazy-loaded React Three Fiber scene renders
the house, example nodes and pods, and nested containers. The inventory and inspector are ordinary
HTML and do not depend on WebGL.

Shared deterministic fixtures in `frontend/src/demo.ts` use `demo-` identifiers and never represent
real cluster objects. The browser polls `/api/v1/status` every 15 seconds for backend availability,
with a four-second request timeout. Fixtures stay explicitly local when the API is unreachable.

Go provides a standard-library HTTP service with bounded timeouts and graceful shutdown. No
database, external Go dependency, Kubernetes client, or update stream is present. It optionally
serves `frontend/dist` on the API origin.

### HTTP contract

| Method     | Path                        | Meaning                                                            |
| ---------- | --------------------------- | ------------------------------------------------------------------ |
| GET / HEAD | `/healthz`                  | HTTP service available; no claim about cluster connectivity        |
| GET / HEAD | `/api/v1/status`            | Version, disconnected connection, demo source, explanatory message |
| GET / HEAD | Static paths, if configured | Compiled application and assets                                    |

Mutation methods are not accepted. Unknown API paths return JSON errors and cannot be masked by
static HTML. No permissive CORS headers are set. Vite supplies a same-origin development proxy.

### Process configuration

| Flag          | Default          | Purpose                                                        |
| ------------- | ---------------- | -------------------------------------------------------------- |
| `-listen`     | `127.0.0.1:8080` | HTTP bind address                                              |
| `-static-dir` | Empty            | Compiled directory with `index.html`; empty runs API-only mode |

## Target live architecture

Nodes, namespaces, pods and derived containers are now implemented in `backend/internal/cluster`.
`GET /api/v1/snapshot` sends full cache snapshots with session ID, revision and per-kind visibility.
The Live cluster tab polls every two seconds and retains stale observations on failure. The 3D
Habitat tab still uses demo fixtures; Phase 03 connects the real layout.

Phase 02 introduces a Kubernetes adapter using Go `client-go` shared informers and a cache. Initial
discovery covers nodes, namespaces, and pods; containers derive from pod specifications and status.

Preserve UID, resource version, observation time, and relationship sources. Expose a consistent
snapshot and ordered incremental updates. Choose transport with the adapter contract; it must
support reconnect, resynchronization, explicit gaps, and stale-data reporting.

Phase 03 derives stable scene placement from observations. Later phases add owners,
services/EndpointSlices, PVC/PV links, metrics, optional observed traffic, and retained history.
Each integration reports availability and provenance.

## Model boundaries

- Namespaces span rooms; they are not node subdivisions in the API.
- Container restarts and pod replacements have distinct identities and animations.
- CPU/memory measurements differ from requests, limits, capacity, and storage.
- Backend liveness is independent of Kubernetes connectivity.
- A topology edge is not observed traffic.
- Missing permissions, telemetry, or connections produce partial/unknown visibility.

## Deployment direction

The target is a self-hosted application with a compiled frontend, Go service, image, and Helm chart.
Authentication, scoped RBAC, configuration, retention policy, and upgrade guidance are required
before a supported public release. Phase 01 is a localhost foundation.

See [ADR 0001](decisions/0001-foundation.md), the [specification](product-spec.md), and the
[roadmap](roadmap.md).
