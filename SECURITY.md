# Security policy

## Supported scope

KubeHabitat is a **development preview with read-only Kubernetes discovery and investigation**. It
has no application authentication or production-support guarantee. The Go service defaults to
`127.0.0.1:8080`; the Vite development server defaults to loopback as well.

Production access controls, deployment hardening, scoped Kubernetes RBAC, and operational guidance
are release requirements on the [roadmap](docs/roadmap.md). Backend availability must never be
presented as a verified cluster connection.

## Report a vulnerability

Use GitHub's **Report a vulnerability** option on the repository Security tab if private
vulnerability reporting is enabled. If it is unavailable, ask the repository maintainer to establish
a private reporting channel without posting exploit details or affected credentials publicly.

Include the affected commit/version, reproduction steps, impact, and a suggested mitigation if
available. Use synthetic examples and redact credentials and identifiable cluster data. The project
does not yet promise a fixed response-time SLA.

## Contributor handling

- Do not commit authentication tokens, kubeconfig, production logs, or Secret payloads.
- Keep dependencies and lockfiles reviewed.
- Keep cluster credentials on the backend when the live adapter is introduced.
- Treat logs, metrics, and traffic sources as separate capabilities with their own permissions.
- Review observation data and user-controlled labels before rendering or logging them.

Investigation reads events on request and optionally reads container logs with `-allow-logs`. Use
namespace-scoped evidence permissions. Log and event text can contain application secrets; these
intentional evidence reads are not automatically redacted. They are rendered as plain text, returned
with `Cache-Control: no-store`, bounded, and not persisted by KubeHabitat. Do not expose the
unauthenticated preview outside localhost. See the [investigation guide](docs/investigation.md).
