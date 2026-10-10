# Connect a live cluster

![KubeHabitat live discovery](assets/live-discovery.svg)

Phase 02 adds a read-only Kubernetes connection and a dedicated **Live cluster** inventory. The
**Habitat** tab remains an authored 3D demo. Generating that house from real cluster objects is
Phase 03; full lifecycle animation is Phase 04.

## Start locally

Keep the backend bound to localhost. Use a kubeconfig context whose permissions are restricted to
`get`, `list`, and `watch` on nodes, namespaces and pods.

```bash
# Repository root; choose your read-only context.
cd backend
go run ./cmd/kubehabitat -live -context YOUR_READ_ONLY_CONTEXT -cluster-name development

# A second terminal, from the repository root.
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/#live`. Kubernetes credentials are loaded by `client-go` on the backend
using the default kubeconfig loading rules, or an explicit `-kubeconfig` path. Never upload your
kubeconfig through the browser or commit it.

For a single process serving the compiled frontend:

```bash
cd frontend
npm ci
npm run build
cd ../backend
go run ./cmd/kubehabitat -live -context YOUR_READ_ONLY_CONTEXT -static-dir ../frontend/dist
```

Without `-live`, the app runs in demo mode and `/api/v1/snapshot` returns `409`. It never
substitutes demo objects for a live connection.

## Service account permissions

[The RBAC example](../deploy/rbac-readonly.yaml) grants only the supported core resources. Create
the `kubehabitat` namespace first. This example is an RBAC building block, not an installation
chart. Phase 09 supplies deployment packaging and authentication. A backend inside Kubernetes can
use `-live -in-cluster`; this is mutually exclusive with kubeconfig/context options.

The adapter watches cluster-wide nodes, namespaces and pods. Resource-specific permission failures
are visible, so allowed resource kinds can still appear when another kind is denied. The current
adapter does not yet scope discovery to a single namespace.

## Read the connection signals

| Signal            | Meaning                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| Observing         | Initial cache synchronized, watch established, recent API verification         |
| Connecting        | Initial synchronization has not completed                                      |
| Reconnecting      | A list, watch or verification request failed; retained data may be stale       |
| Denied            | Authentication or read permissions failed for that resource kind               |
| Stale             | No successful API verification for more than 45 seconds                        |
| Unknown freshness | Browser cannot verify a current snapshot; last observations remain inspectable |

The adapter verifies resource access every 15 seconds using a bounded list request. Watch requests
have a 30-second timeout and are reopened by the reflector. A quiet cluster is not stale merely
because no object changed. Reconnection does not claim to reconstruct missed activity.

## Snapshot contract

`GET /api/v1/snapshot` returns schema version 1, a backend session ID, a monotonically increasing
cache revision, generation time, per-kind visibility, and sorted projected resources. Each response
is a full replacement of the cache view. The browser polls every two seconds, backs off on failure,
retains the last snapshot, rejects malformed and older revisions, and resynchronizes after a backend
restart. This is bounded polling, not a persisted event stream or historical replay.

Pod IDs include Kubernetes UID. Containers use their parent pod ID plus container type and name.
App, init and ephemeral containers are derived from pod specs/status. Their API `uid` is the parent
pod UID: Kubernetes containers do not have independent resource UIDs. A restart keeps that identity;
replacement creates a new pod UID. A deletion removes the pod and its derived containers from the
current snapshot and does not infer a crash.

The API exposes a selected set of fields: names, UID, resource version, observation time, node
assignment, phase, readiness, condition types/status/reasons, container state, restart count and
exit code. It excludes environment variables, annotations, image credentials and raw pod specs. No
Secret API or pod log API is called. Conditions are observed facts, not a guaranteed root-cause
diagnosis.

## Validation boundary

Automated checks cover projection, UID/restart/replacement semantics, container removal, informer
updates, denied-watch visibility, browser contract validation, stale-data behavior and reconnection.
Before closing Phase 02, also verify your own read-only cluster connection, a restricted RBAC
context, and recovery from a real API outage. Services, storage, metrics, traffic and history remain
in their planned roadmap phases.
