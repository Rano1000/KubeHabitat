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
- Reusable isolated kind lab, small workload fixtures, read-only credential generation and
  explicit-context permission checks. See the [local test guide](local-test-cluster.md).

## Verification

- Go unit/informer/API tests pass locally with Go 1.27.2 on Windows.
- `go vet ./...` and a Windows executable build pass.
- TypeScript checking and the Vite production build pass; the lazy Three.js bundle retains its
  existing size warning.
- Local documentation-link validation passes.
- Manual in-app browser smoke review on 2026-10-10 verifies the compiled preview renders the 3D
  house, selecting a demo container updates its inspector, and the Live cluster page explains that
  discovery is disabled. The preview is launched from the user's regular Windows terminal.
- Automated browser checks remain unverified locally: the Windows command sandbox prevents Chromium
  installation/launch. Manual smoke review does not replace the complete browser suite.
- Four local lab launcher tests pass with substituted native tools: help performs no operations, an
  unowned cluster is not mutated, commands use explicit lab contexts and the backend receives only
  observer credentials, and unexpected Secret access prevents backend launch. These checks do not
  contact a Kubernetes cluster.
- The GitHub integration rejects writes with `403 Resource not accessible by integration`.
  Publication and CI verification are pending.

The user launched the isolated kind lab on 2026-10-10. It provided three real nodes, 15 initial pods
and 15 initial containers. Observer list/watch checks passed; create/delete Pod and Secret reads
were denied. The in-app browser verified the live house and namespace filtering. A temporary 2 to 8
replica change created real unscheduled pods and expanded the waiting area; the test deployment was
restored to two replicas. Additional fixtures are recorded in the
[Phase 03 delivery record](phase-03-delivery.md).

The official kind v0.33.0 binary checksum was verified. Docker's named pipe is inaccessible from the
command sandbox. Initial sandbox server attempts could not be reached by the in-app browser; the
prepared launcher runs from the user's regular Windows terminal. The updated preview was later
reachable and manually reviewed as recorded in Phase 03. No production cluster was used.

## Remaining gate

Exercise adapter denied access and API outage/recovery against the real lab, then record evidence
here. Phase 03 implements the real cluster house; Phase 04 adds further lifecycle animation. Phase
02 does not imply production release readiness.
