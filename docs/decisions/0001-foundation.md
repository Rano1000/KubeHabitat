# ADR 0001 · A truthful, runnable foundation

**Status:** Accepted for Phase 01

## Context

KubeHabitat needs a distinctive 3D experience and a trustworthy Kubernetes model. Contributors
should run the first interface before they need cluster credentials. The repository started with a
description only.

## Decision

Use React, TypeScript, Vite, Three.js, and React Three Fiber for the browser, with a Go
standard-library HTTP service. Separate authored fixtures from backend status and real observations.

Render an initial code-native geometric scene; preserve the approved logo and concept art as visual
references. Load the scene independently and retain HTML selection/details when WebGL fails.

Use a checked-in npm lockfile, a dependency-free Go module, same-origin development proxying, and
optional Go static serving. Defer databases, cluster permissions, telemetry collectors, and
production packaging.

## Consequences

The demo establishes vocabulary without claiming live monitoring. Applications build independently.
The next phase needs a Kubernetes adapter and snapshot/update model; the fixtures are not that
contract.

The scene is a foundation rather than final production art. Refinements must preserve semantics,
performance, accessibility, and reduced motion.
