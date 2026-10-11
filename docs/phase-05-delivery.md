# Phase 05 · Investigation

Status: **In review**. Initial on-demand investigation is implemented. Authentication, durable
retention, streaming logs and automatic diagnosis remain outside this delivery.

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

All nine local browser integration cases failed during Edge launch before application assertions;
Windows sandbox named-pipe/profile errors prevented launch. A temporary backend on port 19996 was
also unreachable from the separate command session and was stopped. The user preview was restored
once but later stopped responding during reload. The updated Phase 05 backend must be restarted in
regular PowerShell before combined API checks and visual acceptance can finish. Recovery acceptance
also remains pending. These environment failures are not passing application tests.

## Limits

Evidence is an on-demand snapshot with Kubernetes-controlled retention. Multi-container selections
share parent-pod events, with field paths where reported. Pagination is bounded rather than
exhaustive. Logs are not automatically redacted or persisted. Keep the unauthenticated preview on
localhost. No root cause is asserted from a visual symptom alone.
