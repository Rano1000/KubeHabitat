# Development guide

![KubeHabitat architecture](assets/architecture.svg)

## Requirements

Node.js 22.12+, npm, Go 1.27+, and Git. WebGL is needed for the 3D view; the inventory and inspector
still work when rendering fails. Phase 01 requires no Kubernetes cluster or credentials.

Use `.node-version` to align the Node development version. The checked-in
`frontend/package-lock.json` controls frontend dependency resolution. The Go module pins Kubernetes
client libraries in `go.mod` and `go.sum`.

## Start development

From the repository root, start the backend in one terminal:

```bash
cd backend
go run ./cmd/kubehabitat
```

In another terminal, from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The initial local fixtures remain labelled DEMO. The backend indicator
is separate from cluster connectivity. The Field guide tab opens the interactive documentation.

## Build the app

```bash
# From repository root
cd frontend
npm ci
npm run build
cd ../backend
mkdir -p bin
go build -o bin/kubehabitat ./cmd/kubehabitat
./bin/kubehabitat -static-dir ../frontend/dist
```

Open `http://127.0.0.1:8080`. Missing API routes return JSON errors, not the frontend HTML. Static
serving expects an existing compiled `index.html`.

## Verify changes

```bash
# Repository root
node scripts/check-doc-links.mjs

cd backend
gofmt -w cmd internal
go test ./...
go vet ./...
go build ./cmd/kubehabitat

cd ../frontend
npm ci
npm run build
npx playwright install chromium
npm run test:e2e
```

Run `npm run format` or `npm run format:check` from `frontend/` for repository formatting. Browser
tests launch the Go service and Vite automatically. They verify disconnected semantics, resource
selection, keyboard inspection, reduced motion, responsive layout, and API proxying.
`go test -race ./...` is also run in CI; it needs a working C compiler.

## Repository map

| Path                            | Purpose                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `frontend/src/demo.ts`          | Authored fixture identities and resource relationships             |
| `frontend/src/HabitatScene.tsx` | Geometry, visual signals, camera and orbit controls                |
| `frontend/src/App.tsx`          | Inventory, navigation, inspector, and demo banner                  |
| `frontend/src/Docs.tsx`         | Interactive introductory documentation                             |
| `backend/cmd/kubehabitat`       | HTTP process and graceful shutdown                                 |
| `backend/internal/httpapi`      | Health/status contract and static serving                          |
| `docs/`                         | Product rules, architecture, roadmap, decisions, delivery evidence |
| `scripts/`                      | Repository-level checks                                            |

## Troubleshooting

| Symptom                             | Check                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `go: command not found`             | Install Go 1.27+ and ensure its `bin` directory is on PATH; restart the terminal                                                              |
| Unsupported Node engine             | Check `node --version`; use Node 22.12+                                                                                                       |
| Backend unavailable banner          | Start the backend on `127.0.0.1:8080`; verify `/healthz` with curl                                                                            |
| Port 5173 is occupied               | Stop the other process or use a free local port; Vite intentionally does not silently change ports                                            |
| 3D view unavailable                 | Enable WebGL/hardware acceleration if supported; use the resource list and inspector meanwhile                                                |
| Browser test cannot launch Chromium | Run `npx playwright install chromium`; on supported Linux hosts run `npx playwright install --with-deps chromium` to install system libraries |
| Race detector requires cgo          | Install a C compiler and enable cgo, or run the standard Go tests locally; CI runs the race check                                             |
| Dependencies cannot download        | Check network/proxy access to npm, the Go toolchain, and Playwright's browser downloads                                                       |
| WSL access to approved images       | Windows `C:\Users\user` is typically mounted at `/mnt/c/Users/user`; repository assets are already copied into this branch                    |

## Visual review

Review desktop and narrow layouts, inventory search, kind highlighting, camera guidance, direct
orbit, pause, and system reduced motion. Confirm the API indicator stays distinct from cluster
connectivity. Capture screenshots from the implemented app, label them demo, and keep concept art
clearly identified.

The large scene bundle is lazy-loaded separately from the interface. It is an expected initial
Three.js cost, not a production performance budget. Measure and optimize representative cluster
sizes in Phase 08.

## Live discovery development

Follow the [live connection guide](live-connection.md) to opt into Kubernetes access. The backend
defaults to demo mode and never loads credentials unless `-live` is specified. Browser tests use
authored HTTP responses; adapter tests use fake Kubernetes clients. A production Kubernetes cluster
is not required for these automated checks.

`backend/internal/cluster` implements informers, projection and freshness. The live browser
interface is in `frontend/src/LiveInventory.tsx`; its snapshot contract/recovery logic is in
`frontend/src/useClusterSnapshot.ts`. Real-cluster spatial placement is Phase 03.

Browser checks can use an installed Chromium-compatible executable by setting
`KUBEHABITAT_BROWSER_EXECUTABLE`. If the default ports are occupied, set `KUBEHABITAT_API_PORT` and
`KUBEHABITAT_DEV_PORT` for the test run; defaults remain 8080 and 5173. The Vite proxy uses the same
API port variable. These settings do not change Kubernetes permissions.
