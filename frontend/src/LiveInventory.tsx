import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { liveKinds, useClusterSnapshot } from './useClusterSnapshot'
import type { LiveKind, LiveResource } from './useClusterSnapshot'
import { buildHabitatLayout, namespaceColor } from './habitatLayout'
import { SceneBoundary } from './SceneBoundary'
import { policyCheck } from './networkPolicy'

const LiveHabitatScene = lazy(() =>
  import('./LiveHabitatScene').then((module) => ({ default: module.LiveHabitatScene })),
)
const emptyResources: LiveResource[] = []
const kindLabels: Partial<Record<LiveKind, string>> = {
  Ingress: 'Ingresses',
  NetworkPolicy: 'Network policies',
  StorageClass: 'Storage classes',
  EndpointSlice: 'Endpoint slices',
  PersistentVolumeClaim: 'PVCs',
  PersistentVolume: 'PVs',
  ResourceQuota: 'Quotas',
  Volume: 'Pod volumes',
}

function warning(r: LiveResource) {
  return (
    ['NotReady', 'Failed', 'Waiting', 'Pending', 'Unscheduled', 'Lost'].includes(r.state) ||
    (r.state === 'Terminated' && r.exitCode !== undefined && r.exitCode !== 0) ||
    (r.state === 'Running' && r.ready === false)
  )
}
function stamp(value?: string) {
  return value ? new Date(value).toLocaleTimeString() : 'Not observed'
}

export function LiveInventory() {
  const live = useClusterSnapshot()
  const [kind, setKind] = useState<LiveKind | 'All'>('All')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [namespace, setNamespace] = useState('All')
  const [paused, setPaused] = useState(false)
  const [focusRevision, setFocusRevision] = useState(0)
  const [layers, setLayers] = useState({ network: true, storage: true, capacity: true })
  const [sourceId, setSourceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [networkPort, setNetworkPort] = useState(80)
  const [protocol, setProtocol] = useState('TCP')
  const [reducedMotion, setReducedMotion] = useState(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReducedMotion(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const snapshot = live.snapshot
  const allResources = snapshot?.resources ?? emptyResources
  const resources = useMemo(
    () =>
      allResources.filter(
        (r) =>
          namespace === 'All' ||
          ['Node', 'PersistentVolume', 'StorageClass'].includes(r.kind) ||
          (r.kind === 'Namespace' ? r.name === namespace : r.namespace === namespace),
      ),
    [allResources, namespace],
  )
  const namespaces = [
    ...new Set(
      allResources.flatMap((r) =>
        r.kind === 'Namespace' ? [r.name] : r.namespace ? [r.namespace] : [],
      ),
    ),
  ].sort()
  const layout = useMemo(() => buildHabitatLayout(resources), [resources])
  const current = resources.find((r) => r.id === selected)
  const visible = resources.filter(
    (r) =>
      (kind === 'All' || r.kind === kind) &&
      `${r.name} ${r.namespace ?? ''} ${r.nodeName ?? ''} ${r.kind}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const visibility = (r: LiveResource) =>
    snapshot?.visibility.find(
      (v) => v.kind === (r.kind === 'Container' || r.kind === 'Volume' ? 'Pod' : r.kind),
    )
  const fresh = (r: LiveResource) => !live.stale && visibility(r)?.state === 'observing'
  const pods = resources.filter((r) => r.kind === 'Pod')
  const source = pods.find((r) => r.id === sourceId)
  const destination = pods.find((r) => r.id === destinationId)
  const policyComplete =
    !live.stale &&
    ['Pod', 'Namespace', 'NetworkPolicy'].every((kind) =>
      snapshot?.visibility.some((v) => v.kind === kind && v.state === 'observing'),
    )
  const networkResult =
    source && destination
      ? policyCheck(allResources, source, destination, networkPort, protocol, policyComplete)
      : null
  const signal = (r: LiveResource) =>
    !fresh(r) || r.state === 'Unknown' ? 'unknown' : warning(r) ? 'warning' : 'ready'
  const select = (id: string) => {
    setSelected(id)
    setKind('All')
    setQuery('')
    setFocusRevision((n) => n + 1)
  }
  const reset = () => {
    setKind('All')
    setSelected(null)
    setQuery('')
    setFocusRevision((n) => n + 1)
  }
  return (
    <main id="main-content" className="explorer live-explorer">
      <section className="explorer-intro">
        <div>
          <span className="eyebrow">LIVE KUBERNETES HABITAT / READ ONLY</span>
          <h1>{snapshot?.cluster ?? 'Connect your habitat.'}</h1>
          <p>
            The house follows your cluster. Each observed node has a room; each pod holds its actual
            containers. The layout expands and contracts as workloads change.
          </p>
        </div>
        <div className="demo-counts">
          {(['Node', 'Pod', 'Container'] as const).map((k) => (
            <div key={k}>
              <strong>{resources.filter((r) => r.kind === k).length}</strong>
              <span>{k === 'Node' ? 'Node rooms' : `${k}s in view`}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="connection-strip" aria-label="Cluster connection" role="status">
        <div>
          <span
            className={`signal-dot ${!live.stale && snapshot?.connection === 'connected' ? 'ready' : 'unknown'}`}
          />
          <strong>
            {!snapshot && live.error
              ? 'No live cluster observations'
              : live.stale
                ? 'Awaiting current observations'
                : snapshot?.connection === 'connected'
                  ? 'Connected'
                  : snapshot?.connection === 'disconnected'
                    ? 'Cluster API disconnected'
                    : 'Partial visibility'}
          </strong>
        </div>
        <span>
          {live.age === null ? 'No snapshot received' : `Snapshot received ${live.age}s ago`}
        </span>
        <span>
          {snapshot ? `Revision ${snapshot.revision}` : 'Credentials remain on the backend'}
        </span>
      </section>
      {live.error && (
        <div className="live-alert" role="alert">
          {live.error}
        </div>
      )}
      {live.resynced && (
        <div className="live-alert">
          Resynchronized with a full snapshot. Activity during the connection gap is unknown.
        </div>
      )}
      <details className="visibility-disclosure">
        <summary>
          API permissions &amp; freshness ·{' '}
          {snapshot?.visibility.filter((v) => v.state === 'observing' && !live.stale).length ?? 0}/
          {snapshot?.visibility.length ?? 11} kinds observed
        </summary>
        <div className="visibility-cards">
          {(
            snapshot?.visibility ??
            ['Node', 'Namespace', 'Pod'].map((k) => ({
              kind: k,
              state: 'connecting',
              synced: false,
            }))
          ).map((v) => (
            <article
              key={v.kind}
              className={v.state === 'observing' && !live.stale ? 'observed' : ''}
            >
              <span className="eyebrow">{v.kind} API</span>
              <strong>
                {!snapshot && live.error
                  ? 'Not observing'
                  : live.stale && snapshot
                    ? 'Unknown freshness'
                    : v.state}
              </strong>
              <p>
                {!snapshot && live.error
                  ? 'A live connection is required. No example objects are shown.'
                  : 'reason' in v && v.reason
                    ? String(v.reason)
                    : v.synced
                      ? 'Initial cache synchronized · list + watch'
                      : 'Waiting for initial cache synchronization'}
              </p>
            </article>
          ))}
        </div>
      </details>
      <section className="topology-summary" aria-label="Observation coverage">
        <div>
          <strong>Network</strong>
          <span>
            {resources.filter((r) => r.kind === 'Service').length} services ·{' '}
            {resources.filter((r) => r.kind === 'NetworkPolicy').length} policies
          </span>
          <small>Configured relationships · traffic telemetry unavailable</small>
        </div>
        <div>
          <strong>Storage</strong>
          <span>
            {resources.filter((r) => r.kind === 'Volume').length} pod volumes ·{' '}
            {resources.filter((r) => r.kind === 'PersistentVolumeClaim').length} namespace claims ·{' '}
            {resources.filter((r) => r.kind === 'PersistentVolume').length} cluster volumes
          </span>
          <small>Capacity and references · disk usage unavailable</small>
        </div>
        <div>
          <strong>CPU & memory</strong>
          <span>{snapshot?.metrics?.state ?? 'unavailable'}</span>
          <small>{snapshot?.metrics?.reason ?? 'No Metrics API observations'}</small>
        </div>
      </section>
      <div className="workspace live-workspace">
        <aside className="inventory" aria-label="Live resource inventory">
          <div className="panel-heading">
            <h2>Components</h2>
            <span>{resources.length} observed</span>
          </div>
          <label className="search-label" htmlFor="namespace-scope">
            Namespace
          </label>
          <select
            id="namespace-scope"
            className="namespace-scope"
            value={namespace}
            onChange={(e) => {
              setNamespace(e.target.value)
              reset()
            }}
          >
            <option value="All">All namespaces · entire cluster</option>
            {namespaces.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {namespace !== 'All' && !namespaces.includes(namespace) && (
              <option value={namespace}>{namespace} · no longer observed</option>
            )}
          </select>
          <p className="scope-note">
            {namespace === 'All'
              ? 'Includes Kubernetes system workloads.'
              : `Workloads in ${namespace}; all observed node rooms remain visible.`}
          </p>
          <label className="search-label" htmlFor="live-search">
            Find a live component
          </label>
          <input
            id="live-search"
            type="search"
            placeholder="Name, namespace or node…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="kind-filters" aria-label="Live resource kinds">
            {(['All', ...liveKinds] as const).map((k) => (
              <button
                key={k}
                className={k === kind ? 'active' : ''}
                aria-pressed={k === kind}
                onClick={() => {
                  setKind(k)
                  setSelected(null)
                  setFocusRevision((n) => n + 1)
                }}
              >
                {k === 'All' ? 'Everything' : (kindLabels[k] ?? `${k}s`)}
                <span>
                  {k === 'All' ? resources.length : resources.filter((r) => r.kind === k).length}
                </span>
              </button>
            ))}
          </div>
          <div className="resource-list">
            {visible.map((r) => (
              <button
                key={r.id}
                className={`resource-item ${selected === r.id ? 'selected' : ''}`}
                aria-pressed={selected === r.id}
                onClick={() => select(r.id)}
              >
                <span className="resource-glyph">
                  {r.kind === 'Node'
                    ? '▣'
                    : r.kind === 'Namespace'
                      ? '◉'
                      : r.kind === 'Pod'
                        ? '⬡'
                        : '□'}
                </span>
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.kind}
                    {r.namespace ? ` · ${r.namespace}` : ''}
                  </small>
                </span>
                <span className={`signal-dot ${signal(r)}`} />
              </button>
            ))}
            {visible.length === 0 && (
              <p className="empty-result">
                {snapshot
                  ? 'No observed components match this view.'
                  : 'Real cluster components will appear after discovery connects.'}
              </p>
            )}
          </div>
          <div className="inventory-footer">
            Containers come from their parent pod. No Secret payloads or environment variables are
            exposed.
          </div>
        </aside>
        <section
          className="scene-panel live-house-panel"
          aria-label="Live cluster house"
          data-node-count={layout.rooms.length}
          data-pod-count={layout.pods.length}
          data-container-count={resources.filter((r) => r.kind === 'Container').length}
          data-layout-width={layout.width}
          data-layout-depth={layout.depth}
        >
          <div className="scene-toolbar">
            <div>
              <strong>{snapshot?.cluster ?? 'Awaiting a cluster'}</strong>
              <span>{namespace === 'All' ? 'Entire cluster' : namespace} · observed objects</span>
            </div>
            <button className="subtle-button" onClick={reset}>
              Reset view
            </button>
          </div>
          <div className="layer-controls" aria-label="Visual layers">
            {(['network', 'storage', 'capacity'] as const).map((layer) => (
              <button
                key={layer}
                className="subtle-button"
                aria-pressed={layers[layer]}
                onClick={() => setLayers((value) => ({ ...value, [layer]: !value[layer] }))}
              >
                {layer === 'capacity'
                  ? 'CPU & memory'
                  : layer === 'storage'
                    ? 'Storage'
                    : 'Networking'}
              </button>
            ))}
          </div>
          <div className="scene live-house-scene">
            {snapshot ? (
              <SceneBoundary>
                <Suspense
                  fallback={
                    <div className="scene-fallback" role="status">
                      Preparing the live habitat…
                    </div>
                  }
                >
                  <LiveHabitatScene
                    layout={layout}
                    selected={selected}
                    matching={visible.map((r) => r.id)}
                    focusRevision={focusRevision}
                    motion={!paused && !reducedMotion && !live.stale}
                    fresh={fresh}
                    onSelect={select}
                    layers={layers}
                    policyEdge={
                      networkResult && source && destination
                        ? { from: source.id, to: destination.id, verdict: networkResult.verdict }
                        : undefined
                    }
                  />
                </Suspense>
              </SceneBoundary>
            ) : (
              <div className="scene-fallback" role="status">
                <strong>Your real cluster belongs here.</strong>
                <p>
                  Connect the backend to Kubernetes to generate its house. No demo pods are
                  substituted.
                </p>
                <a className="text-link" href="#docs">
                  Open the connection guide
                </a>
              </div>
            )}
            {snapshot && (
              <>
                <div className="scene-label">
                  HOUSE = CLUSTER <span>ROOMS = OBSERVED NODES</span>
                </div>
                <div className="scene-hint">
                  Drag to orbit · Scroll to zoom · Click a room, pod or container
                </div>
              </>
            )}
          </div>
          <div className="live-scene-counts" role="status">
            {layout.rooms.length} node rooms · {layout.pods.length} pods ·{' '}
            {resources.filter((r) => r.kind === 'Container').length} containers
            {snapshot && (live.stale || snapshot.connection !== 'connected')
              ? ' · some observations retained; check freshness'
              : ''}
          </div>
          <div className="scene-footer">
            <div className="scene-legend">
              <span>
                <i className="signal-dot ready" />
                Observed ready
              </span>
              <span>
                <i className="signal-dot warning" />
                Needs investigation
              </span>
              <span>
                <i className="signal-dot unknown" />
                Unknown
              </span>
            </div>
            <button
              className="subtle-button"
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? 'Resume motion' : 'Pause motion'}
            </button>
          </div>
          {reducedMotion && (
            <p className="reduced-motion-note">
              Reduced motion is enabled by your system. Workload and camera animations are paused.
            </p>
          )}
          <div className="namespace-legend">
            {[...new Set(layout.pods.map((p) => p.resource.namespace ?? ''))]
              .filter(Boolean)
              .map((name) => (
                <button
                  key={name}
                  className="text-link"
                  onClick={() => {
                    const ns = resources.find((r) => r.kind === 'Namespace' && r.name === name)
                    if (ns) select(ns.id)
                  }}
                >
                  <i style={{ background: namespaceColor(name) }} />
                  {name}
                </button>
              ))}
          </div>
          <p className="scope-note scene-note">
            Floor rings show namespace membership across rooms. Room size reflects object placement,
            not CPU or memory capacity. Healthy motion requires fresh Pod Ready observations.
          </p>
          <p className="scope-note scene-note">
            Blue lines show configured network references; gold lines show storage references. Lines
            represent configuration, not measured traffic. Disk cylinders are volumes; gateways are
            services; purple panels are network policies.
          </p>
          <section className="network-check" aria-label="Pod network policy check">
            <h3>Pod → pod policy check</h3>
            <div className="network-inputs">
              <label>
                Source pod
                <select
                  aria-label="Source pod"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                >
                  <option value="">Select source…</option>
                  {pods.map((pod) => (
                    <option key={pod.id} value={pod.id}>
                      {pod.namespace}/{pod.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination pod
                <select
                  aria-label="Destination pod"
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                >
                  <option value="">Select destination…</option>
                  {pods.map((pod) => (
                    <option key={pod.id} value={pod.id}>
                      {pod.namespace}/{pod.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Port
                <input
                  type="number"
                  aria-label="Destination port"
                  min={1}
                  max={65535}
                  value={networkPort}
                  onChange={(e) => setNetworkPort(Number(e.target.value))}
                />
              </label>
              <label>
                Protocol
                <select
                  aria-label="Network protocol"
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                >
                  {['TCP', 'UDP', 'SCTP'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <p role="status" className="policy-verdict">
              {networkResult?.verdict ?? 'Select two observed pods to inspect declared policy.'}
            </p>
            <p className="scope-note">
              {networkResult?.explanation ??
                'Checks source egress and destination ingress. Actual connectivity and CNI enforcement need separate evidence.'}
            </p>
          </section>
        </section>
        <aside className="details" aria-label="Live component details" aria-live="polite">
          <div className="panel-heading">
            <h2>Inspector</h2>
            <span>KUBERNETES</span>
          </div>
          {current ? (
            <>
              <span className="eyebrow detail-kind">{current.kind}</span>
              <h3>{current.name}</h3>
              <span className={`state-badge ${signal(current)}`}>
                {fresh(current) ? current.state : 'Unknown freshness'}
              </span>
              {!fresh(current) && (
                <p className="detail-description">
                  Last observed state: {current.state}. This is retained data, not a current health
                  verdict.
                </p>
              )}
              <dl>
                {(
                  [
                    ['UID', current.uid],
                    ['Resource version', current.resourceVersion],
                    ['Observed at', stamp(current.observedAt)],
                    ['Namespace', current.namespace],
                    ['Assigned node', current.nodeName],
                    ['Pod phase', current.phase],
                    [
                      current.kind === 'Container' ? 'Container ready' : 'Ready condition',
                      current.kind === 'Namespace'
                        ? undefined
                        : current.ready === undefined
                          ? 'Unknown'
                          : String(current.ready),
                    ],
                    ['Container type', current.containerType],
                    ['Restart count', current.restartCount],
                    ['Waiting / termination reason', current.reason],
                    ['Exit code', current.exitCode],
                    ['Deletion requested', current.deleting ? 'Yes' : undefined],
                  ] as const
                ).map(
                  ([label, value]) =>
                    value !== undefined && (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd className={label === 'UID' ? 'mono' : ''}>{value}</dd>
                      </div>
                    ),
                )}
                {current.parent && (
                  <div>
                    <dt>Parent pod</dt>
                    <dd>
                      <button className="text-link" onClick={() => select(current.parent!)}>
                        {resources.find((r) => r.id === current.parent)?.name ?? current.parent}
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
              {current.kind === 'Pod' && (
                <section className="relationship-list">
                  <h4>Inside this pod</h4>
                  {resources
                    .filter((r) => r.parent === current.id)
                    .map((child) => (
                      <div key={child.id}>
                        <small>
                          {child.kind}
                          {child.containerType ? ` · ${child.containerType}` : ''} ·{' '}
                          {fresh(child) ? child.state : 'Unknown freshness'}
                        </small>
                        <button className="text-link" onClick={() => select(child.id)}>
                          {child.name}
                        </button>
                      </div>
                    ))}
                </section>
              )}
              {current.details && Object.keys(current.details).length > 0 && (
                <section className="resource-values">
                  <h4>Observed configuration</h4>
                  <dl>
                    {Object.entries(current.details)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                  </dl>
                  <p className="scope-note">
                    Requests, limits, capacity and quota accounting describe configuration. They are
                    not measured resource consumption.
                  </p>
                </section>
              )}
              {['Node', 'Pod', 'Container'].includes(current.kind) && (
                <section className="usage-card">
                  <h4>Measured usage</h4>
                  {current.usage && fresh(current) ? (
                    <>
                      <div className="usage-values">
                        <div>
                          <span>CPU</span>
                          <strong>{current.usage.cpuMilli} m</strong>
                        </div>
                        <div>
                          <span>Memory working set</span>
                          <strong>{(current.usage.memoryBytes / 1048576).toFixed(1)} MiB</strong>
                        </div>
                      </div>
                      <p className="scope-note">
                        Metrics API · {stamp(current.usage.timestamp)} · sample window{' '}
                        {current.usage.window}
                      </p>
                    </>
                  ) : (
                    <p className="scope-note">
                      Usage unknown.{' '}
                      {snapshot?.metrics?.reason ?? 'Metrics API samples are unavailable.'}
                    </p>
                  )}
                </section>
              )}
              {current.links && current.links.length > 0 && (
                <section className="relationship-list">
                  <h4>Observed references</h4>
                  {current.links.map((link, index) => {
                    const target = allResources.find(
                      (r) =>
                        r.kind === link.kind &&
                        (link.uid
                          ? r.uid === link.uid || r.id === link.uid
                          : r.name === link.name &&
                            (link.namespace ? r.namespace === link.namespace : !r.namespace)),
                    )
                    return (
                      <div key={index}>
                        <small>{link.relation}</small>
                        {target ? (
                          <button
                            className="text-link"
                            onClick={() => {
                              if (
                                target.namespace &&
                                namespace !== 'All' &&
                                target.namespace !== namespace
                              )
                                setNamespace('All')
                              select(target.id)
                            }}
                          >
                            {target.kind} · {target.name}
                          </button>
                        ) : (
                          <span>
                            {link.kind} · {link.name ?? 'identity'} · not observed
                          </span>
                        )}
                      </div>
                    )
                  })}
                </section>
              )}
              {current.conditions && current.conditions.length > 0 && (
                <div className="condition-list">
                  <h4>Observed conditions</h4>
                  {current.conditions.map((c) => (
                    <div key={c.type}>
                      <strong>
                        {c.type}: {c.status}
                      </strong>
                      <span>{c.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="evidence-note">
                <strong>Source: Kubernetes API</strong>
                <p>
                  Pod Ready, container state and application health are different. A container
                  restart retains its pod UID; a replacement has a new UID.
                </p>
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              <div className="inspector-icon">◎</div>
              <h3>{selected ? 'Component left the cache.' : 'Follow an observation.'}</h3>
              <p>
                {selected
                  ? 'The selected identity is no longer present. No crash or replacement has been inferred.'
                  : 'Select a real component to inspect its identity, readiness, conditions and freshness.'}
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
