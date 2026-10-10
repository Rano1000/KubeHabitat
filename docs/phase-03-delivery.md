# Phase 03 delivery record

![Live scene relationships](assets/live-topology.svg)

## Implemented

- Habitat and Live cluster share real snapshot data; authored fixtures require `/#demo`.
- Deterministic node rooms, assigned pods and every app/init/ephemeral container.
- House and room dimensions grow and shrink with observed placement. Unscheduled pods have a waiting
  area; missing nodes never manufacture rooms.
- Namespace overlays, kind highlighting, selection, inspector and guided camera focus.
- Readiness motion requires fresh Pod Ready evidence; pause and system reduced motion are respected.
- Initial live network/storage/resource layers requested alongside the house correction. See the
  [coverage guide](live-topology.md) for supported resources and evidence boundaries.
- Real isolated fixtures: three-container pod, shared PVC and memory-backed volume, service,
  endpoint slice, policy, client pods and namespace quota.

## Verification on 2026-10-10

| Check                            | Evidence                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original live house              | In-app browser verified 3 node rooms, 15 pods and 15 containers from the lab                                                                         |
| Namespace scope                  | `habitat-lab` correctly showed all 3 node rooms and its 2 pods/containers before adding topology fixtures                                            |
| Real scale change                | Deployment scaled 2 → 8 → 2; the scene showed 8 pods and house depth expanded from 11 to 17.74 layout units, with unscheduled pods in a waiting area |
| Multi-container/storage fixtures | Kubernetes reported `habitat-shared` 3/3 Running, a Bound 64 Mi PVC, service and policy objects                                                      |
| Model and policy checks          | 17 Node test cases pass, covering identity, count, placement, growth/contraction, cross-node namespaces and policy semantics                         |
| Backend                          | Go tests including topology projection/redaction and metric units/failure handling pass                                                              |
| Frontend                         | TypeScript check and Vite production build pass                                                                                                      |

The expanded topology browser review awaits the user launching the prepared preview outside the
Windows command sandbox. A sandbox-launched server was not reachable by the in-app browser. The full
automated browser suite remains unverified locally; manual checks do not substitute for it.

## Open acceptance work

Refine house artwork with the user; review the expanded layers in the live browser; verify camera
and keyboard navigation across further cluster sizes; complete denied access/outage/recovery lab
scenarios. Later-phase telemetry, controller/custom-resource coverage and lifecycle history remain
open. No production release or successful GitHub publication is claimed.
