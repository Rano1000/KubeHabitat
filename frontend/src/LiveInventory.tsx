import { useState } from 'react'
import { liveKinds, useClusterSnapshot } from './useClusterSnapshot'
import type { LiveKind, LiveResource } from './useClusterSnapshot'

function warning(r: LiveResource) {
  return (
    ['NotReady', 'Failed', 'Waiting'].includes(r.state) ||
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
  const snapshot = live.snapshot
  const resources = snapshot?.resources ?? []
  const current = resources.find((r) => r.id === selected)
  const visible = resources.filter(
    (r) =>
      (kind === 'All' || r.kind === kind) &&
      `${r.name} ${r.namespace ?? ''} ${r.nodeName ?? ''} ${r.kind}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const visibility = (r: LiveResource) =>
    snapshot?.visibility.find((v) => v.kind === (r.kind === 'Container' ? 'Pod' : r.kind))
  const fresh = (r: LiveResource) => !live.stale && visibility(r)?.state === 'observing'
  const signal = (r: LiveResource) =>
    !fresh(r) || r.state === 'Unknown' ? 'unknown' : warning(r) ? 'warning' : 'ready'
  return (
    <main id="main-content" className="explorer live-explorer">
      <section className="explorer-intro">
        <div>
          <span className="eyebrow">LIVE OBSERVATION / READ ONLY</span>
          <h1>{snapshot?.cluster ?? 'Connect your habitat.'}</h1>
          <p>
            Every component starts with an observation. Its identity, state and source stay
            together.
          </p>
        </div>
        <div className="demo-counts">
          {(['Node', 'Pod', 'Container'] as const).map((k) => (
            <div key={k}>
              <strong>{resources.filter((r) => r.kind === k).length}</strong>
              <span>{k}s observed</span>
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
            {live.stale
              ? 'Awaiting current observations'
              : snapshot?.connection === 'connected'
                ? 'Connected'
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
      <div className="visibility-cards">
        {(
          snapshot?.visibility ??
          ['Node', 'Namespace', 'Pod'].map((k) => ({ kind: k, state: 'connecting', synced: false }))
        ).map((v) => (
          <article
            key={v.kind}
            className={v.state === 'observing' && !live.stale ? 'observed' : ''}
          >
            <span className="eyebrow">{v.kind} API</span>
            <strong>{live.stale && snapshot ? 'Unknown freshness' : v.state}</strong>
            <p>
              {'reason' in v && v.reason
                ? String(v.reason)
                : v.synced
                  ? 'Initial cache synchronized · list + watch'
                  : 'Waiting for initial cache synchronization'}
            </p>
          </article>
        ))}
      </div>
      <div className="workspace live-workspace">
        <aside className="inventory" aria-label="Live resource inventory">
          <div className="panel-heading">
            <h2>Components</h2>
            <span>{resources.length} observed</span>
          </div>
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
                }}
              >
                {k === 'All' ? 'Everything' : `${k}s`}
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
                onClick={() => setSelected(r.id)}
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
        <section className="live-observation" aria-label="Live observations">
          <div className="panel-heading">
            <h2>Observation map</h2>
            <span>PHASE 02</span>
          </div>
          <div className="observation-orbit" aria-hidden="true">
            <div className="orbit-ring" />
            <div className="orbit-ring inner" />
            <span>⎈</span>
          </div>
          <h2>From cluster to component.</h2>
          <p>
            Read-only discovery is the foundation of your living house. The real-cluster 3D layout
            and guided camera arrive in Phase 03.
          </p>
          <div className="observation-chain">
            <span>Kubernetes API</span>
            <i>→</i>
            <span>Shared cache</span>
            <i>→</i>
            <span>Live inventory</span>
          </div>
          <div className="observation-states">
            {['Ready', 'NotReady', 'Unscheduled', 'Completed', 'Failed', 'Unknown'].map((state) => (
              <div key={state}>
                <span>{state}</span>
                <strong>
                  {resources.filter((r) => r.kind === 'Pod' && r.state === state).length}
                </strong>
              </div>
            ))}
          </div>
          <a className="primary-link" href="#habitat">
            Explore the authored 3D demo →
          </a>
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
                      <button className="text-link" onClick={() => setSelected(current.parent!)}>
                        {resources.find((r) => r.id === current.parent)?.name ?? current.parent}
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
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
