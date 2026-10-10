# A real cluster for local testing

![Live discovery pipeline](assets/live-discovery.svg)

The local lab uses [kind](https://kind.sigs.k8s.io/docs/user/quick-start/), which runs Kubernetes
nodes inside Docker containers. It is separate from the authored Habitat demo and from your other
Kubernetes contexts. It gives the Live cluster inventory real objects to observe.

## Preview and test workflow

| Mode                | What you see                                            | When to use it                                       |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Habitat demo        | Authored nodes, pods and containers                     | Visual design and navigation, without Kubernetes     |
| Development preview | Frontend hot reload; a local backend                    | Everyday coding; keep the servers running            |
| Compiled preview    | The last built frontend and backend                     | Review a delivery; rebuild for source changes        |
| Local cluster       | Actual Kubernetes objects and readiness                 | Verify discovery, identity, permissions and recovery |
| Automated tests     | Fake-client backend tests and isolated browser fixtures | Repeatable checks without a real cluster             |

You do not create a new cluster or manually launch a browser for every test. Reuse the lab across
integration checks. Browser tests start their own backend and frontend servers. Production use
connects to the operator's existing cluster; users do not need a kind lab.

## Create or reuse the lab

Install Node.js 22.12+, Docker with Linux containers, kubectl, and kind v0.33.0. Start Docker first.
Use the official [kind release](https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0) and
verify the downloaded executable against its published SHA-256 checksum.

From the repository root:

```bash
node scripts/local-test-cluster.mjs
```

Use `--kind PATH` if kind is not on PATH. The script creates `kubehabitat-lab`: one control-plane
node and two workers. Kubernetes 1.37.0 is pinned by image digest in the launcher. The API listens
on localhost. Creation downloads the node image and can take several minutes; the machine needs
enough Docker memory for three nodes. It installs two small `habitat-web` replicas in `habitat-lab`.
These are observation fixtures using the Kubernetes pause image, not an application traffic demo.

The launcher refuses to modify a same-name cluster without this checkout's ownership record. It
never automatically deletes a cluster and never changes your default kubeconfig or current context.
All kubectl operations specify the lab's configuration and context explicitly.

## Connect KubeHabitat read-only

The lab applies [observer RBAC](../deploy/rbac-readonly.yaml) and generates a service-account token
requesting a one-hour lifetime. It verifies that node/namespace/pod reads work, pod creation and
deletion are denied, and Secret reads are denied. Credentials and permission evidence are stored
under `.local/test-cluster/`, which Git ignores. Do not include this directory in source archives.
Use `--state-dir PATH` to keep these private files outside a delivery folder.

After building the app, from the repository root on Linux:

```bash
node scripts/local-test-cluster.mjs --serve \
  --binary backend/bin/kubehabitat --static-dir frontend/dist
```

On Windows PowerShell:

```powershell
node scripts/local-test-cluster.mjs --serve `
  --binary backend/bin/kubehabitat.exe --static-dir frontend/dist
```

The live preview opens at `http://127.0.0.1:19092/#live`. Keep the terminal running. The original
demo preview can remain on its separate port. Stopping the preview leaves the lab cluster intact. If
the token expires, stop the live preview and rerun the launcher; it reuses the cluster and issues a
new token. The backend receives only the observer configuration, never the lab administrator's
configuration.

For hot reload, run the launcher without `--serve`, start the backend with `-live` and the observer
kubeconfig (see [live connection](live-connection.md)), and start Vite as described in the
[development guide](development.md). Set `KUBEHABITAT_API_PORT` when choosing a different backend
port. Frontend edits refresh through Vite; backend edits require restarting the Go process.

## Integration checks

Use the dedicated administrator configuration only to drive lab changes. The running app keeps its
observer configuration. Example commands below are from the repository root.

```bash
kubectl --kubeconfig .local/test-cluster/admin.json --context kind-kubehabitat-lab \
  get pods -n habitat-lab -o wide
```

Check the Live cluster inventory for node placement, pod UID, readiness and container relationships.
Delete one generated `habitat-web` pod by its exact name and watch the Deployment create a new UID.
Confirm the old identity leaves the inventory; normal deletion is not labelled a crash.

Apply optional failure fixtures when checking image-pull and unscheduled states:

```bash
kubectl --kubeconfig .local/test-cluster/admin.json --context kind-kubehabitat-lab \
  apply -f deploy/local-test/failure-scenarios.yaml
```

The missing image should produce a waiting/pull-error reason, and the impossible node selector
should leave its pod unscheduled. Neither represents a confirmed pod crash. Remove only these
fixture objects after review:

```bash
kubectl --kubeconfig .local/test-cluster/admin.json --context kind-kubehabitat-lab \
  delete -f deploy/local-test/failure-scenarios.yaml
```

A real-cluster acceptance run must also check a controlled API outage, retained stale observations,
reconnection, restricted reads, and a real container restart without changing the pod UID. Record
the observed results before marking Phase 02 complete. The launcher alone does not prove those
checks or the Phase 03 live 3D layout.
