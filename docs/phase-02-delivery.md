# Phase 02 delivery record

![Live observation boundary](assets/live-discovery.svg)

## Implemented

- Opt-in, read-only `client-go` discovery for nodes, namespaces and pods.
- App, init and ephemeral containers projected from pod data.
- Full snapshot contract with UID, opaque resource version, session ID, cache revision and
  timestamps.
- Per-kind synchronization, permissions, reconnect state and freshness verification.
- Dedicated live inventory with search, kind filters, keyboard selection and condition inspector.
- Retained stale observations, browser retry/backoff and full resynchronization.
- Server-side credential loading, minimal RBAC example and a custom architecture graphic.
- Existing 3D demo, guided demo camera and animated Field guide preserved.

## Verification

- Go unit/informer/API tests pass locally with Go 1.27.2 on Windows.
- `go vet ./...` and a Windows executable build pass.
- TypeScript checking and the Vite production build pass; the lazy Three.js bundle retains its
  existing size warning.
- Local documentation-link validation passes.
- Browser checks are added but not verified locally: the Windows command sandbox prevents Chromium
  installation/launch, and the in-app browser cannot reach the preview server. These environment
  failures are not passing UI checks.
- The GitHub integration rejects writes with `403 Resource not accessible by integration`.
  Publication and CI verification are pending.

Real-cluster validation is still required: this workspace has no configured Kubernetes cluster. Fake
Kubernetes clients validate adapter behavior; they are not a production-cluster test.

## Remaining gate

Connect the backend to a real read-only context, exercise denied access and API outage/recovery,
then record evidence here. Phase 03 generates the real cluster house; Phase 04 adds lifecycle
animation. Phase 02 does not imply production release readiness.
