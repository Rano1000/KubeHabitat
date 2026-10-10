# Contributing to KubeHabitat

![How observations become a visual story](docs/assets/architecture.svg)

Thanks for helping make Kubernetes easier to understand. Contributions in engineering, visual
design, Kubernetes modeling, documentation, and accessibility are welcome through issues during
initial development. Pull requests will be accepted after the first public release. Follow our
[code of conduct](CODE_OF_CONDUCT.md).

## Find the right starting point

Read the [product specification](docs/product-spec.md), [architecture](docs/architecture.md), and
[roadmap](docs/roadmap.md). Phase 01 is an authored demo with no cluster connection. Keep
improvements within a clearly described phase or discuss a larger proposal in an issue first.

For a first contribution, consider a reproducible setup improvement, an accessibility issue, a
clarified visual label, or a focused rendering improvement. The project does not yet promise a
populated `good first issue` queue.

## Development workflow before release

Maintainer development goes directly to `main`. Validate each focused change before committing and
pushing, and check CI after publication. Pull requests are not required or accepted during this
stage. Report bugs and propose ideas through issues.

Clone the repository and follow the [development guide](docs/development.md). Preserve authored
examples as demo data. Never commit kubeconfig, credentials, real cluster logs, or Secret payloads.

After the first public release, contributors will fork the repository, create a focused branch, and
submit pull requests using the guidance below.

Use Node.js 22.12+ and Go 1.27+. Install frontend dependencies with `npm ci`. A Kubernetes cluster
is not needed for foundation work.

## Design and implementation expectations

- Explain behavior in terms of observed Kubernetes state. A visual metaphor must not invent an API
  relationship or lifecycle event.
- Keep inventory, scene, and inspector synchronized. Provide HTML and keyboard paths for important
  interactions.
- Support pause and reduced motion. Use animation to communicate meaning rather than just
  decoration.
- Keep brand assets attributed, diagrams editable, screenshots accurate, and examples visibly
  labelled.
- Add dependencies only when they serve a concrete need. Commit lockfile changes with dependency
  changes.
- Use `gofmt` for Go and follow existing TypeScript conventions. Avoid unrelated formatting or
  refactoring in feature changes.
- Update documentation when behavior or setup changes. Identify current versus planned
  functionality.

## Validate your change

Run the checks relevant to your change. The full foundation checks are:

```bash
# Repository root
node scripts/check-doc-links.mjs

cd backend
go test ./...
go vet ./...
go build ./cmd/kubehabitat
cd ../frontend
npm ci
npm run format:check
npm run build
npx playwright install chromium
npm run test:e2e
```

Run `npm run format` from `frontend/` to apply the repository's Prettier formatting. Go's race
detector is an additional CI check and requires a C compiler. Browser tests launch their own backend
and Vite servers. Linux hosts may need Chromium's system libraries; see
[troubleshooting](docs/development.md#troubleshooting).

Add meaningful tests for behavior changes, especially identity, stale data, lifecycle state,
resource selection, and accessibility. Documentation-only edits need link checks and visual review,
rather than a new unit test for prose.

## Pull requests after release

Describe the problem, resulting behavior, validation, and material limitations. Include screenshots
for visual changes and explain the source behind visual state changes. Link an issue when one
exists. Keep PRs focused enough to review.

CI is verification evidence, not a substitute for Kubernetes modeling review. Maintainers may
request changes before merging. Mark roadmap work complete only after its acceptance criteria and
review are satisfied.

By submitting a contribution, you agree that your contribution is available under the repository's
[Apache-2.0 license](LICENSE). Do not add third-party material whose permissions or attribution are
unclear.
