# Phase 05 · Investigation

Status: **Initial delivery validated**. On-demand investigation passes the combined live lab.
Authentication, durable retention, streaming logs and automatic diagnosis remain outside this
delivery.

![KubeHabitat evidence workflow](assets/investigation-flow.svg)

## Delivered

- Expandable inspector with exact-UID Kubernetes events, reported reasons, counts and time.
- Explicit current/previous container logs with opt-in backend access and namespaced RBAC.
- Bounded reads, no-store responses, plain-text rendering and categorized permission failures.
- Pod identity checks before and after log retrieval; replacement bodies are withheld.
- Independent pod/container colours preserved, with a combined acceptance lab.

## Validation

Backend tests cover UID/namespace filtering, no implicit logs, permission denial, replacement races,
unavailable previous logs, deleted pods, bounded bodies and the real Kubernetes log transport query.
Frontend fixtures cover selected identity, run selection, bounds and malformed responses. Browser
fixtures cover the combined colour and investigation workflow.

On 2026-10-11, all 44 frontend model tests, six lab isolation tests, Go tests, Go vet, backend
build, frontend production build, formatting and 112 local documentation links passed. The real lab
installed all five scenarios; kubectl confirmed waiting, scheduling, failure and completion states,
with one healthy sibling beside the restarting container.

The published initial delivery passed every step of the
[GitHub workflow](https://github.com/Rano1000/KubeHabitat/actions/runs/38137581484), including
Chromium browser integration. Local Edge launch remains blocked by Windows sandbox
named-pipe/profile errors; those failed launches are not passing application tests.

The restarted user preview passed all ten real-cluster fault checks: independent pod/container
colours, scheduling, image waiting, failure, completion, exact-UID events and previous failure logs.
In-app inspection confirmed the normal pod shell alongside a red crashing container, reported
BackOff events and previous exit-42 logs. Recovery retained the pod UID, restored both containers to
Running/Ready, and returned the recovery message in current logs with historical exit 42 intact.

The first recovery run passed ten of eleven checks. Its remaining check exposed a kubelet runtime
failure returned in an HTTP-success log body, also reproduced using kubectl. The follow-up
classifies that known un-timestamped response as unavailable without exposing runtime IDs or hiding
timestamped application messages. Go tests/vet/build and nine lab/evidence tests pass for this fix.
The updated running binary correctly classified the old runtime failure as unavailable while the
container remained Ready. The follow-up
[GitHub workflow](https://github.com/Rano1000/KubeHabitat/actions/runs/38140193136) also passed.

A fresh isolated lab cycle then passed **10/10 fault checks and 11/11 recovery checks**. Only the
owned disposable multi-container test pod was recreated, using a UID precondition; existing
application workloads were untouched. The new pod retained its UID throughout fault and recovery,
with the healthy sibling staying healthy. Current recovery logs, previous failure evidence and exit
42 history were verified together. Full-screen monitoring with its inspector was checked in the
in-app browser using Midnight Habitat. The earlier fault panel was also inspected in Garden and
Blueprint; a comprehensive accessibility review remains planned.

Recovery acceptance requires a fully passing fault report for the same UID before accepting explicit
previous-log unavailability. It still requires current recovery logs and historical exit 42. Local
assertion reports contain no log bodies or event messages and are not published.

## Limits

Evidence is an on-demand snapshot with Kubernetes-controlled retention. Multi-container selections
share parent-pod events, with field paths where reported. Pagination is bounded rather than
exhaustive. Logs are not automatically redacted or persisted. Keep the unauthenticated preview on
localhost. No root cause is asserted from a visual symptom alone.
