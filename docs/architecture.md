# Architecture

![KubeHabitat live evidence layers](assets/live-topology.svg)

## Implemented data path

React, TypeScript and Vite provide the browser shell. Read-only Go client-go informers observe
nodes, namespaces, pods, services, EndpointSlices, ingress, NetworkPolicy, PVCs, PVs, StorageClasses
and ResourceQuotas. Containers and pod volumes derive from pod specifications and status.

The Go cache projects an intentionally narrow contract: identity, relationships, conditions,
capacity, resource declarations and policy selectors/rules. Environment values, Secret payloads, raw
specifications, annotations, provider credentials and host volume paths are excluded. Pod and
namespace labels are included for declared policy evaluation.

The browser polls full snapshots every two seconds and keeps its last observations when requests
fail. Each API kind reports synchronization, permission and freshness independently. One snapshot
drives inventory counts, spatial layout and inspector. `habitatLayout.ts` generates rooms from
observed nodes, positions assigned pods in their node rooms, nests each container and resolves
observed references. Unscheduled pods and pods whose nodes were not observed use a waiting area.

The live scene is lazy-loaded with React Three Fiber. `/#habitat` and `/#live` share this renderer;
`/#demo` explicitly opens authored fixtures. No live error substitutes demo objects. The resource
inventory and inspector remain ordinary HTML when WebGL fails.

## Telemetry and policy boundaries

Optional Metrics API polling supplies CPU and memory samples with timestamp and window. Sampling
uses read-only access and binds values to observed identities. A failed request clears current usage
claims; old or missing measurements are not zero. Capacity, requests, limits and quota accounting
remain separate from usage.

Network connectors represent object references. A pure policy evaluator checks source egress and
destination ingress for a selected port/protocol. Unsupported IP/CIDR evaluation, unavailable named
ports or incomplete observations produce Unknown. Policy declarations do not prove CNI enforcement,
routing, application listeners or measured communication. Traffic and filesystem usage providers
remain planned. See [coverage and evidence](live-topology.md).

## HTTP contract

| Method     | Path                        | Meaning                                                             |
| ---------- | --------------------------- | ------------------------------------------------------------------- |
| GET / HEAD | `/healthz`                  | HTTP service availability                                           |
| GET / HEAD | `/api/v1/status`            | Service version and connection/data-source state                    |
| GET / HEAD | `/api/v1/snapshot`          | Credential-free cache snapshot; 409 when live discovery is disabled |
| GET / HEAD | Static paths, if configured | Compiled frontend and assets                                        |

Mutations return 405. Unknown API paths return JSON errors and are not masked by static HTML. The
service has bounded HTTP timeouts and graceful shutdown. Vite forwards API requests on the
development origin. No permissive CORS headers are configured.

## Process configuration

| Flag            | Default                         | Meaning                                                            |
| --------------- | ------------------------------- | ------------------------------------------------------------------ |
| `-listen`       | `127.0.0.1:8080`                | HTTP bind address                                                  |
| `-static-dir`   | Empty                           | Compiled frontend; empty means API only                            |
| `-live`         | False                           | Explicit opt-in to Kubernetes credentials/discovery                |
| `-kubeconfig`   | Client-go default loading rules | Backend-only credential path                                       |
| `-context`      | Kubeconfig selected context     | Explicit context override                                          |
| `-in-cluster`   | False                           | Pod service account, incompatible with explicit kubeconfig/context |
| `-cluster-name` | `my-cluster`                    | Display label, not API server address                              |

Credentials stay server-side. [Example RBAC](../deploy/rbac-readonly.yaml) grants reads only for
supported resources and optional metrics, without Secret access, pod logs, kubelet proxy or writes.
Production authentication and supported deployment packaging remain Phase 09.

## Next integrations

Controller ownership, custom-resource extensions, recorded lifecycle/history, evidence-backed
investigation, traffic telemetry and storage consumption will extend the same identity and freshness
boundary. Namespaces span node rooms; container restarts differ from pod replacements; successful
completion differs from failure. Missing observations never imply a confirmed crash.

See the [live connection guide](live-connection.md), [specification](product-spec.md),
[roadmap](roadmap.md) and [original foundation decision](decisions/0001-foundation.md).
