# Phase 06 delivery record

![Phase 06 evidence model](assets/metrics-ownership.svg)

State: **In review**. Implementation adds workload ownership and short inspector metrics trends to
existing Service, EndpointSlice and storage relationships. It also fixes unnecessary watch cycling
and preserves credential-error categories. This phase is not yet production-certified.

## Verification scope

Automated checks cover watch timeout preservation, intentional stop, unexpected closure, credential
errors and superseded-watch callbacks; controller identity and template redaction; current
generation, zero replicas, Job retry and completion semantics; metric units, measured zero, missing
CPU, negative values, incomplete sidecars, invalid windows and stale or replacement samples;
ownership navigation, application scope and bounded histories with gaps.

Local Go tests, `go vet`, backend build, frontend build, all 52 frontend model tests, nine lab and
evidence tests, and 131 local documentation-link checks passed on 11 October 2026.

GitHub CI for `baa5ebc` passed backend race tests, formatting, builds and all 52 frontend model
tests. Twenty of 22 browser tests passed, including clickable pod → ReplicaSet → Deployment ancestry
and measurement availability. Two existing navigation tests failed because the ownership card added
a second button bearing the parent pod's name. Their locators now target the identity disclosure's
parent link explicitly; the corrected suite awaits a new CI run. See the
[failed run](https://github.com/Rano1000/KubeHabitat/actions/runs/38171683977).

A separate synthetic acceptance server was reachable by local commands but timed out in the in-app
browser; that attempt does not count as browser validation. The running development preview reported
denied access across all resource kinds before observer renewal, so retained observations cannot
establish current live acceptance.

Manual checks in the existing in-app preview verified the updated ownership inspector's missing
reference state and unknown-usage message. A duplicate sibling-key issue found during that check was
corrected; subsequent snapshot refreshes retained exactly one investigation panel and one metrics
panel in expanded monitoring. The regression is covered by the authored browser test.

## Remaining acceptance

- Validate a refreshed read-only observer against the live development cluster, including continued
  watch health, controller discovery and write/Secret-read denial.
- Verify measurements against a real Metrics API provider, with matching timestamps and units.
  Missing telemetry is an expected supported state, not proof of the measured path.
- Validate generation/rollout behavior on representative controller types and a larger cluster.
- Optional external-storage integrations, durable metric retention, disk usage and measured network
  traffic are outside this delivery.

See [usage and ownership](metrics-and-ownership.md), the [roadmap](roadmap.md), and the
[live connection guide](live-connection.md).
