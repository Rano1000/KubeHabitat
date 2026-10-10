import { lazy, Suspense, useEffect, useState } from 'react'
import { Docs } from './Docs'
import { LiveInventory } from './LiveInventory'
import { isWarning, kinds, resources } from './demo'
import type { ResourceKind } from './demo'
import { SceneBoundary } from './SceneBoundary'
import { useBackendStatus } from './useBackendStatus'

const HabitatScene = lazy(() =>
  import('./HabitatScene').then((module) => ({ default: module.HabitatScene })),
)

export function App() {
  const [view, setView] = useState(
    window.location.hash === '#docs'
      ? 'docs'
      : window.location.hash === '#live'
        ? 'live'
        : 'habitat',
  )
  const [kind, setKind] = useState<ResourceKind | 'All'>('All')
  const [selected, setSelected] = useState<string | null>(null)
  const [focusRevision, setFocusRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const backend = useBackendStatus()
  const current = resources.find((resource) => resource.id === selected)
  const visible = resources.filter(
    (resource) =>
      (kind === 'All' || resource.kind === kind) &&
      `${resource.name} ${resource.kind} ${resource.namespace ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    const changeView = () =>
      setView(
        window.location.hash === '#docs'
          ? 'docs'
          : window.location.hash === '#live'
            ? 'live'
            : 'habitat',
      )
    window.addEventListener('hashchange', changeView)
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('hashchange', changeView)
    }
  }, [])

  function selectKind(value: ResourceKind | 'All') {
    setKind(value)
    setSelected(null)
    setFocusRevision((value) => value + 1)
  }

  return (
    <div className={`app ${paused || reducedMotion ? 'motion-paused' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <a className="brand" href="#habitat" aria-label="KubeHabitat home">
          <img src="/brand/kubehabitat-logo.png" alt="KubeHabitat" />
          <span className="brand-caption">A living view of Kubernetes</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#habitat" aria-current={view === 'habitat' ? 'page' : undefined}>
            Habitat
          </a>
          <a href="#docs" aria-current={view === 'docs' ? 'page' : undefined}>
            Field guide
          </a>
          <a href="#live" aria-current={view === 'live' ? 'page' : undefined}>
            Live cluster
          </a>
          <a href="https://github.com/Rano1000/KubeHabitat" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </nav>
        {view === 'docs' && (
          <button
            className="subtle-button"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? 'Resume animations' : 'Pause animations'}
          </button>
        )}
        <span className="phase-label">PHASE 02 / LIVE DISCOVERY</span>
      </header>
      {view !== 'live' && (
        <div className="demo-banner">
          <span className="demo-tag">DEMO</span>
          <p>
            {backend.status?.dataSource === 'kubernetes'
              ? 'Authored demo house. Use Live cluster for Kubernetes observations.'
              : 'Illustrative resources. Kubernetes is not connected.'}
          </p>
          <span className="backend-status" role="status">
            <span className={`signal-dot ${backend.available ? 'ready' : 'unknown'}`} />
            {backend.available
              ? backend.status?.dataSource === 'kubernetes'
                ? `Backend available · cluster ${backend.status.connection}`
                : 'Backend available · cluster disconnected'
              : 'Backend unavailable · local demo only'}
          </span>
        </div>
      )}
      {view === 'docs' ? (
        <Docs />
      ) : view === 'live' ? (
        <LiveInventory />
      ) : (
        <main id="main-content" className="explorer">
          <section className="explorer-intro">
            <div>
              <span className="eyebrow">CLUSTER EXPLORER</span>
              <h1>Your cluster, brought into view.</h1>
              <p>Explore the house. Follow a workload. Understand what each signal means.</p>
            </div>
            <div className="demo-counts">
              <div>
                <strong>2</strong>
                <span>Example nodes</span>
              </div>
              <div>
                <strong>3</strong>
                <span>Example pods</span>
              </div>
              <div>
                <strong>1</strong>
                <span>Example warning</span>
              </div>
            </div>
          </section>
          <div className="workspace">
            <aside className="inventory" aria-label="Resource inventory">
              <div className="panel-heading">
                <h2>Components</h2>
                <span>{resources.length} demo</span>
              </div>
              <label className="search-label" htmlFor="resource-search">
                Find a component
              </label>
              <input
                id="resource-search"
                type="search"
                placeholder="Search by name or kind…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="kind-filters" aria-label="Resource kinds">
                {(['All', ...kinds] as const).map((value) => (
                  <button
                    key={value}
                    className={kind === value ? 'active' : ''}
                    aria-pressed={kind === value}
                    onClick={() => selectKind(value)}
                  >
                    {value === 'All' ? 'Everything' : `${value}s`}
                    <span>
                      {value === 'All'
                        ? resources.length
                        : resources.filter((item) => item.kind === value).length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="resource-list" aria-label="Matching resources">
                {visible.map((resource) => (
                  <button
                    className={`resource-item ${selected === resource.id ? 'selected' : ''}`}
                    key={resource.id}
                    aria-pressed={selected === resource.id}
                    onClick={() => setSelected(resource.id)}
                  >
                    <span className={`resource-symbol ${isWarning(resource) ? 'warning' : ''}`}>
                      {resource.kind === 'Node'
                        ? '▣'
                        : resource.kind === 'Namespace'
                          ? '◈'
                          : resource.kind === 'Pod'
                            ? '⬡'
                            : '□'}
                    </span>
                    <span>
                      <strong>{resource.name}</strong>
                      <small>
                        {resource.kind}
                        {resource.namespace ? ` · ${resource.namespace}` : ''}
                      </small>
                    </span>
                    <span className={`signal-dot ${isWarning(resource) ? 'warning' : 'ready'}`} />
                  </button>
                ))}
                {visible.length === 0 && (
                  <p className="empty-result">No demo components match this search.</p>
                )}
              </div>
              <div className="inventory-footer">
                Services, storage, ingress, and additional components will appear when their
                integrations are implemented.
              </div>
            </aside>
            <section className="scene-panel" aria-label="Cluster house demonstration">
              <div className="scene-toolbar">
                <div>
                  <strong>demo-habitat</strong>
                  <span>Read-only illustration</span>
                </div>
                <button
                  className="subtle-button"
                  onClick={() => {
                    selectKind('All')
                    setQuery('')
                  }}
                >
                  Reset view
                </button>
              </div>
              <div className="scene">
                <SceneBoundary>
                  <Suspense
                    fallback={
                      <div className="scene-fallback" role="status">
                        Preparing the habitat…
                      </div>
                    }
                  >
                    <HabitatScene
                      selected={selected}
                      kind={kind}
                      focusRevision={focusRevision}
                      motion={!paused && !reducedMotion}
                      onSelect={setSelected}
                    />
                  </Suspense>
                </SceneBoundary>
                <div className="scene-label">
                  HOUSE = CLUSTER <span>ROOMS = NODES</span>
                </div>
                <div className="scene-hint">
                  Drag to orbit · Scroll to zoom · Select a component
                </div>
              </div>
              <div className="scene-footer">
                <div className="scene-legend">
                  <span>
                    <i className="signal-dot ready" /> Ready example
                  </span>
                  <span>
                    <i className="signal-dot warning" /> Container restart loop
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
                  Reduced motion is enabled by your system. Workload and documentation animations
                  are paused.
                </p>
              )}
            </section>
            <aside className="details" aria-label="Component details" aria-live="polite">
              <div className="panel-heading">
                <h2>Inspector</h2>
                <span>DEMO</span>
              </div>
              {current ? (
                <>
                  <span className="eyebrow detail-kind">{current.kind}</span>
                  <h3>{current.name}</h3>
                  <span className={`state-badge ${isWarning(current) ? 'warning' : 'ready'}`}>
                    {current.state}
                  </span>
                  <p className="detail-description">{current.description}</p>
                  <dl>
                    {current.phase && (
                      <div>
                        <dt>Kubernetes phase (example)</dt>
                        <dd>{current.phase}</dd>
                      </div>
                    )}
                    {typeof current.ready === 'boolean' && (
                      <div>
                        <dt>Pod Ready condition (example)</dt>
                        <dd>{String(current.ready)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Data source</dt>
                      <dd>Local demo fixture</dd>
                    </div>
                    <div>
                      <dt>Demo identifier</dt>
                      <dd className="mono">{current.id}</dd>
                    </div>
                    {current.namespace && (
                      <div>
                        <dt>Namespace</dt>
                        <dd>{current.namespace}</dd>
                      </div>
                    )}
                    {current.node && (
                      <div>
                        <dt>Node</dt>
                        <dd>{resources.find((item) => item.id === current.node)?.name}</dd>
                      </div>
                    )}
                    {current.parent && (
                      <div>
                        <dt>Parent pod</dt>
                        <dd>
                          <button
                            className="text-link"
                            onClick={() => setSelected(current.parent!)}
                          >
                            {resources.find((item) => item.id === current.parent)?.name}
                          </button>
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="evidence-note">
                    <strong>Evidence comes next.</strong>
                    <p>
                      Real conditions, events, metrics, and logs will be connected in later phases.
                      This state is an authored example.
                    </p>
                  </div>
                </>
              ) : (
                <div className="inspector-empty">
                  <div className="inspector-icon">◎</div>
                  <h3>Follow a component.</h3>
                  <p>
                    Choose an item in the list or the house to focus the scene and inspect its
                    meaning.
                  </p>
                  <div className="inspector-tip">
                    Try{' '}
                    <button
                      className="text-link"
                      onClick={() => setSelected('demo-container-worker')}
                    >
                      the amber worker container
                    </button>{' '}
                    to explore a restart-loop example.
                  </div>
                </div>
              )}
            </aside>
          </div>
          <section className="next-step">
            <div>
              <span className="eyebrow">BUILT IN THE OPEN</span>
              <h2>A foundation for something bigger.</h2>
              <p>
                Live observation, accurate lifecycle signals, and evidence-driven investigation are
                the next chapters.
              </p>
            </div>
            <a className="primary-link" href="#docs">
              Explore the field guide →
            </a>
          </section>
        </main>
      )}
      <footer className="app-footer">
        <span>KubeHabitat · Open-source cluster exploration</span>
        <span>Apache-2.0 · Independent community project</span>
      </footer>
    </div>
  )
}
