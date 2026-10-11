import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { liveKinds, useClusterSnapshot } from './useClusterSnapshot'
import type { LiveKind, LiveResource } from './useClusterSnapshot'
import { namespaceColor } from './habitatLayout'
import {
  application,
  applicationScope,
  containerIndex,
  healthSummary,
  scalableLayout,
  workloadGroups,
  warning,
  observedChanges,
  INVENTORY_PAGE,
} from './scaleModel'
import type { Activity } from './scaleModel'
import {
  WorkloadNavigator,
  WorkloadInspector,
  HabitatMap,
  ActivityPanel,
  SummaryText,
} from './ScaleNavigation'
import { podServices, serviceColor } from './serviceGuide'
import { SceneBoundary } from './SceneBoundary'
import { useMonitoringView } from './useMonitoringView'
import { policyCheck } from './networkPolicy'
import {
  overviewKinds,
  storageKinds,
  networkKinds,
  podStorage,
  sceneObjectIds,
  storageFacts,
} from './habitatView'

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

function stamp(value?: string) {
  return value ? new Date(value).toLocaleTimeString() : 'Not observed'
}

export function LiveInventory() {
  const live = useClusterSnapshot()
  const monitoring = useMonitoringView()
  const [monitorOptions, setMonitorOptions] = useState(false)
  const [kind, setKind] = useState<LiveKind | 'All'>('All')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [namespace, setNamespace] = useState('All')
  const [applicationKey, setApplicationKey] = useState('')
  const [detailMode, setDetailMode] = useState<'auto' | 'grouped' | 'individual'>('auto')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [replicaPage, setReplicaPage] = useState(0)
  const [inventoryPage, setInventoryPage] = useState(0)
  const [activity, setActivity] = useState<Activity[]>([])
  const previousSnapshot = useRef<typeof live.snapshot>(null)
  const [savedViewMessage, setSavedViewMessage] = useState('')
  const [paused, setPaused] = useState(false)
  const [focusRevision, setFocusRevision] = useState(0)
  const housePanel = useRef<HTMLElement>(null)
  const [layers, setLayers] = useState({ network: false, storage: false, capacity: false })
  const [storagePod, setStoragePod] = useState<string | null>(null)
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
  useEffect(() => {
    if (focusRevision === 0 || !housePanel.current) return
    const top = housePanel.current.getBoundingClientRect().top
    if (top < 0 || top > window.innerHeight * 0.3)
      housePanel.current.scrollIntoView({
        block: 'start',
        behavior: reducedMotion ? 'instant' : 'smooth',
      })
  }, [focusRevision, reducedMotion])
  const snapshot = live.snapshot
  const allResources = snapshot?.resources ?? emptyResources
  const namespaceResources = useMemo(
    () =>
      allResources.filter(
        (r) =>
          namespace === 'All' ||
          ['Node', 'PersistentVolume', 'StorageClass'].includes(r.kind) ||
          (r.kind === 'Namespace' ? r.name === namespace : r.namespace === namespace),
      ),
    [allResources, namespace],
  )
  const resources = useMemo(
    () => applicationScope(namespaceResources, applicationKey),
    [namespaceResources, applicationKey],
  )
  const groups = useMemo(() => workloadGroups(resources), [resources])
  const compact = detailMode === 'grouped' || resources.filter((r) => r.kind === 'Pod').length > 80
  const selectedGroup = groups.find((g) => g.id === selected)
  const children = useMemo(() => containerIndex(resources), [resources])
  useEffect(() => {
    if (!snapshot) return
    const before = live.resynced || live.stale ? null : previousSnapshot.current
    const changes = observedChanges(before, snapshot)
    if (before?.sessionId !== snapshot.sessionId) setActivity([])
    if (changes.length) setActivity((items) => [...changes.reverse(), ...items].slice(0, 20))
    previousSnapshot.current = snapshot
  }, [snapshot, live.resynced, live.stale])
  useEffect(() => setInventoryPage(0), [query, kind, namespace, applicationKey, onlyIssues])
  const namespaces = [
    ...new Set(
      allResources.flatMap((r) =>
        r.kind === 'Namespace' ? [r.name] : r.namespace ? [r.namespace] : [],
      ),
    ),
  ].sort()
  const objectIds = useMemo(
    () => sceneObjectIds(resources, layers, storagePod),
    [resources, layers, storagePod],
  )
  const layout = useMemo(
    () =>
      scalableLayout(
        resources,
        objectIds,
        compact,
        selectedGroup?.id ?? null,
        replicaPage,
        selected,
      ),
    [resources, objectIds, compact, selectedGroup?.id, replicaPage, selected],
  )
  const current = resources.find((r) => r.id === selected)
  const attachedStorage = storagePod ? podStorage(resources, storagePod) : null
  const visibility = (r: LiveResource) =>
    snapshot?.visibility.find(
      (v) => v.kind === (r.kind === 'Container' || r.kind === 'Volume' ? 'Pod' : r.kind),
    )
  const fresh = (r: LiveResource) => !live.stale && visibility(r)?.state === 'observing'
  const visible = resources.filter(
    (r) =>
      (kind === 'All' || r.kind === kind) &&
      (query !== '' ||
        kind !== 'All' ||
        overviewKinds.includes(r.kind) ||
        objectIds.has(r.id) ||
        r.id === selected) &&
      (!attachedStorage || !storageKinds.includes(r.kind) || attachedStorage.has(r.id)) &&
      (!onlyIssues ||
        !fresh(r) ||
        r.state === 'Unknown' ||
        warning(r) ||
        (r.kind === 'Pod' && children.get(r.id)?.some(warning))) &&
      `${r.name} ${r.namespace ?? ''} ${r.nodeName ?? ''} ${r.kind} ${Object.entries(r.labels ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const summaries = new Map(
    groups.map((g) => [g.id, healthSummary(g.pods, resources, fresh, children)]),
  )
  const nodeSummaries = new Map(
    layout.rooms.map((room) => [
      room.resource.name,
      healthSummary(
        resources.filter((r) => r.kind === 'Pod' && r.nodeName === room.resource.name),
        resources,
        fresh,
        children,
      ),
    ]),
  )
  const groupCandidates = groups.filter(
    (g) =>
      (!onlyIssues || summaries.get(g.id)!.warning > 0 || summaries.get(g.id)!.unknown > 0) &&
      `${g.name} ${g.namespace} ${g.nodeName}`.toLowerCase().includes(query.toLowerCase()),
  )
  const listPage = Math.min(
    inventoryPage,
    Math.max(0, Math.ceil(visible.length / INVENTORY_PAGE) - 1),
  )
  const openGroup = (id: string, page = 0) => {
    if (monitoring.expanded) monitoring.setPanel('details')
    setSelected(id)
    setReplicaPage(page)
    setKind('All')
    setQuery('')
    setOnlyIssues(false)
    setFocusRevision((n) => n + 1)
  }
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
    if (monitoring.expanded) monitoring.setPanel('details')
    if (groups.some((g) => g.id === id)) {
      openGroup(id)
      return
    }
    const resource = allResources.find((r) => r.id === id)
    if (resource && !resources.some((r) => r.id === id)) setApplicationKey('')
    if (resource?.kind === 'Namespace') {
      setNamespace(resource.name)
      setStoragePod(null)
      setLayers({ network: false, storage: false, capacity: false })
    } else if (resource?.namespace && namespace !== 'All' && resource.namespace !== namespace) {
      setNamespace(resource.namespace)
    }
    if (resource && storageKinds.includes(resource.kind)) {
      setLayers((value) => ({ ...value, storage: true }))
      if (resource.kind === 'Volume') setStoragePod(resource.parent ?? null)
      else if (storagePod && !podStorage(allResources, storagePod).has(resource.id))
        setStoragePod(null)
    }
    if (resource && networkKinds.includes(resource.kind))
      setLayers((value) => ({ ...value, network: true }))
    if (resource?.kind === 'Pod' && layers.storage) setStoragePod(resource.id)
    setSelected(id)
    setKind('All')
    setQuery('')
    setOnlyIssues(false)
    setFocusRevision((n) => n + 1)
  }
  const reset = () => {
    setKind('All')
    setSelected(null)
    setQuery('')
    setReplicaPage(0)
    setOnlyIssues(false)
    setStoragePod(null)
    setLayers({ network: false, storage: false, capacity: false })
    setSourceId('')
    setDestinationId('')
    setFocusRevision((n) => n + 1)
  }
  const filterKind = (value: LiveKind | 'All') => {
    setKind(value)
    setSelected(null)
    setStoragePod(null)
    if (value !== 'All' && storageKinds.includes(value))
      setLayers((layers) => ({ ...layers, storage: true }))
    if (value !== 'All' && networkKinds.includes(value))
      setLayers((layers) => ({ ...layers, network: true }))
    setFocusRevision((n) => n + 1)
  }
  const showPodStorage = (podId: string) => {
    setStoragePod(podId)
    setLayers((value) => ({ ...value, storage: true }))
    setKind('Volume')
    setQuery('')
    setFocusRevision((n) => n + 1)
  }
  const saveView = () => {
    try {
      localStorage.setItem(
        `kubehabitat:view:${snapshot?.cluster}`,
        JSON.stringify({ namespace, applicationKey, detailMode, onlyIssues }),
      )
      setSavedViewMessage('View saved on this browser.')
    } catch {
      setSavedViewMessage('Browser storage is unavailable.')
    }
  }
  const restoreView = () => {
    try {
      const value = JSON.parse(
        localStorage.getItem(`kubehabitat:view:${snapshot?.cluster}`) ?? 'null',
      )
      if (
        !value ||
        !['auto', 'grouped', 'individual'].includes(value.detailMode) ||
        typeof value.onlyIssues !== 'boolean' ||
        typeof value.applicationKey !== 'string'
      ) {
        setSavedViewMessage('No valid saved view for this cluster.')
        return
      }
      setNamespace(namespaces.includes(value.namespace) ? value.namespace : 'All')
      setApplicationKey(
        allResources.some((r) => application(r) === value.applicationKey)
          ? value.applicationKey
          : '',
      )
      setDetailMode(value.detailMode)
      reset()
      setOnlyIssues(value.onlyIssues)
      setSavedViewMessage('Saved view restored.')
    } catch {
      setSavedViewMessage('Saved view is unavailable.')
    }
  }
  return (
    <main
      ref={monitoring.root}
      id="main-content"
      className={`explorer live-explorer ${monitoring.expanded ? 'monitoring-expanded' : ''}`}
      data-monitor-panel={monitoring.panel ?? 'none'}
      data-monitor-options={monitorOptions}
    >
      <section className="explorer-intro">
        <div>
          <span className="eyebrow">LIVE KUBERNETES HABITAT / READ ONLY</span>
          <h1>{snapshot?.cluster ?? 'Connect your habitat.'}</h1>
          <p>
            Your running cluster: nodes, namespaces, pods and services. Select a component to
            explore its storage, networking and resource details.
          </p>
        </div>
        <div className="demo-counts">
          {(['Node', 'Pod', 'Service'] as const).map((k) => (
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
      <details className="visibility-disclosure">
        <summary>Storage, networking and resource coverage</summary>
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
              {resources.filter((r) => r.kind === 'PersistentVolumeClaim').length} namespace claims
              · {resources.filter((r) => r.kind === 'PersistentVolume').length} cluster volumes
            </span>
            <small>Capacity and references · disk usage unavailable</small>
          </div>
          <div>
            <strong>CPU & memory</strong>
            <span>{snapshot?.metrics?.state ?? 'unavailable'}</span>
            <small>{snapshot?.metrics?.reason ?? 'No Metrics API observations'}</small>
          </div>
        </section>
      </details>
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
            placeholder="Name, node or label (app=shop)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="search-label" htmlFor="application-scope">
            Application view
          </label>
          <select
            id="application-scope"
            value={applicationKey}
            onChange={(e) => {
              setApplicationKey(e.target.value)
              reset()
            }}
          >
            <option value="">All applications</option>
            {[...new Set(namespaceResources.map(application).filter(Boolean))].sort().map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <p className="scope-note">
            Applications follow explicit labels. Referenced Services and storage are included as
            dependencies.
          </p>
          <button
            className="subtle-button issue-filter"
            aria-pressed={onlyIssues}
            onClick={() => {
              setOnlyIssues((value) => !value)
              setSelected(null)
              setFocusRevision((n) => n + 1)
            }}
          >
            Needs investigation / unknown
          </button>
          <WorkloadNavigator
            groups={groupCandidates}
            summaries={summaries}
            onOpen={openGroup}
            expanded={compact || !!selectedGroup}
          />
          <div className="kind-filters" aria-label="Live resource kinds">
            {(['All', ...overviewKinds] as const).map((k) => (
              <button
                key={k}
                className={k === kind ? 'active' : ''}
                aria-pressed={k === kind}
                onClick={() => filterKind(k)}
              >
                {k === 'All' ? 'Overview' : (kindLabels[k] ?? `${k}s`)}
                <span>
                  {k === 'All'
                    ? resources.filter((r) => overviewKinds.includes(r.kind)).length
                    : resources.filter((r) => r.kind === k).length}
                </span>
              </button>
            ))}
          </div>
          <details
            className="component-disclosure"
            open={kind !== 'All' && !overviewKinds.includes(kind)}
          >
            <summary>More components</summary>
            <div className="kind-filters advanced-kind-filters">
              {liveKinds
                .filter((k) => !overviewKinds.includes(k))
                .map((k) => (
                  <button
                    key={k}
                    className={k === kind ? 'active' : ''}
                    aria-pressed={k === kind}
                    onClick={() => filterKind(k)}
                  >
                    {kindLabels[k] ?? `${k}s`}{' '}
                    <span>{resources.filter((r) => r.kind === k).length}</span>
                  </button>
                ))}
            </div>
          </details>
          {storagePod && layers.storage && (
            <div className="storage-scope" role="status">
              Storage for {resources.find((r) => r.id === storagePod)?.name ?? 'selected pod'}
              <button
                className="text-link"
                onClick={() => {
                  setStoragePod(null)
                  setKind('Volume')
                }}
              >
                Show all pod storage
              </button>
            </div>
          )}
          <div className="resource-list">
            {visible.slice(listPage * INVENTORY_PAGE, (listPage + 1) * INVENTORY_PAGE).map((r) => (
              <button
                key={r.id}
                className={`resource-item ${selected === r.id ? 'selected' : ''}`}
                aria-pressed={selected === r.id}
                onClick={() => select(r.id)}
              >
                <span
                  className="resource-glyph"
                  style={r.kind === 'Service' ? { color: serviceColor(r) } : undefined}
                >
                  {r.kind === 'Node'
                    ? '▣'
                    : r.kind === 'Namespace'
                      ? '◉'
                      : r.kind === 'Pod'
                        ? '⬡'
                        : r.kind === 'Service'
                          ? '♟'
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
          {visible.length > INVENTORY_PAGE && (
            <div className="pagination">
              <button
                className="subtle-button"
                disabled={listPage === 0}
                onClick={() => setInventoryPage(listPage - 1)}
              >
                Previous components
              </button>
              <span>
                {listPage * INVENTORY_PAGE + 1}–
                {Math.min((listPage + 1) * INVENTORY_PAGE, visible.length)} / {visible.length}
              </span>
              <button
                className="subtle-button"
                disabled={(listPage + 1) * INVENTORY_PAGE >= visible.length}
                onClick={() => setInventoryPage(listPage + 1)}
              >
                Next components
              </button>
            </div>
          )}
          <div className="inventory-footer">
            Select a namespace to enter it. More components appear when requested.
          </div>
        </aside>
        <section
          ref={housePanel}
          className="scene-panel live-house-panel"
          aria-label="Live cluster house"
          data-node-count={layout.rooms.length}
          data-pod-count={layout.totalPods}
          data-rendered-pod-count={layout.pods.length}
          data-workload-group-count={layout.groups.length}
          data-container-count={resources.filter((r) => r.kind === 'Container').length}
          data-layout-width={layout.width}
          data-layout-depth={layout.depth}
          data-service-count={resources.filter((r) => r.kind === 'Service').length}
          data-storage-object-count={
            layout.objects.filter((o) => storageKinds.includes(o.resource.kind)).length
          }
          data-network-detail-count={
            layout.objects.filter((o) => networkKinds.includes(o.resource.kind)).length
          }
          data-namespace-scope={namespace}
        >
          {monitoring.expanded && (
            <div className="monitor-toolbar" aria-label="Monitoring controls">
              <div className="monitor-title">
                <strong>{snapshot?.cluster ?? 'Awaiting a cluster'}</strong>
                <span role="status">
                  <i
                    className={`signal-dot ${!live.stale && snapshot?.connection === 'connected' ? 'ready' : 'unknown'}`}
                  />
                  {live.stale
                    ? 'Observations unknown'
                    : snapshot?.connection === 'connected'
                      ? 'Connected'
                      : 'Partial / disconnected'}
                  {' · '}
                  {live.age === null ? 'No snapshot' : `${live.age}s ago`}
                </span>
              </div>
              <div className="monitor-actions">
                <button
                  className="subtle-button"
                  aria-pressed={monitoring.panel === 'components'}
                  onClick={() =>
                    monitoring.setPanel(monitoring.panel === 'components' ? null : 'components')
                  }
                >
                  Components
                </button>
                <button
                  className="subtle-button"
                  aria-pressed={monitoring.panel === 'details'}
                  onClick={() =>
                    monitoring.setPanel(monitoring.panel === 'details' ? null : 'details')
                  }
                >
                  Details
                </button>
                <button
                  className="subtle-button"
                  aria-pressed={monitorOptions}
                  onClick={() => setMonitorOptions((value) => !value)}
                >
                  Scene options
                </button>
                <button className="subtle-button" onClick={reset}>
                  Reset view
                </button>
                {!monitoring.fullscreen && (
                  <button
                    className="subtle-button"
                    onClick={() => void monitoring.requestFullscreen()}
                  >
                    Full screen
                  </button>
                )}
                <button
                  ref={monitoring.exitButton}
                  className="subtle-button monitor-exit"
                  onClick={monitoring.exit}
                >
                  Exit monitoring
                </button>
              </div>
              {monitoring.notice && (
                <span className="monitor-notice" role="status">
                  {monitoring.notice}
                </span>
              )}
              {live.error && (
                <span className="monitor-notice" role="alert">
                  {live.error}
                </span>
              )}
            </div>
          )}
          <div className="scene-toolbar">
            <div>
              <strong>{snapshot?.cluster ?? 'Awaiting a cluster'}</strong>
              <span>{namespace === 'All' ? 'Entire cluster' : namespace} · observed objects</span>
            </div>
            <div className="scene-actions">
              <button
                ref={monitoring.expandButton}
                className="subtle-button expand-monitoring"
                onClick={monitoring.enter}
              >
                ⛶ Expand monitoring
              </button>
              <button className="subtle-button" onClick={reset}>
                Reset view
              </button>
            </div>
          </div>
          <div className="scale-toolbar" aria-label="Scale navigation">
            <label>
              Scene detail{' '}
              <select
                aria-label="Scene detail"
                value={detailMode}
                onChange={(e) => {
                  setDetailMode(e.target.value as typeof detailMode)
                  reset()
                }}
              >
                <option value="auto">Automatic</option>
                <option value="grouped">Grouped workloads</option>
                <option value="individual" disabled={layout.totalPods > 80}>
                  Individual pods (up to 80)
                </option>
              </select>
            </label>
            <button className="subtle-button" onClick={saveView}>
              Save view
            </button>
            <button className="subtle-button" onClick={restoreView}>
              Restore view
            </button>
            {savedViewMessage && <span role="status">{savedViewMessage}</span>}
          </div>
          <nav className="habitat-breadcrumb" aria-label="Habitat location">
            <button
              className="text-link"
              onClick={() => {
                setNamespace('All')
                setApplicationKey('')
                reset()
              }}
            >
              Cluster
            </button>
            {namespace !== 'All' && <span> / {namespace}</span>}
            {applicationKey && <span> / {applicationKey}</span>}
            {(current || selectedGroup) && <span> / {current?.name ?? selectedGroup?.name}</span>}
          </nav>
          {compact && (
            <p className="scale-note" role="status">
              {layout.totalPods} observed pods · {layout.groups.length} collapsed groups ·{' '}
              {layout.pods.length} individual pods shown. Click a group to explore 48 members per
              page; zoom close to preview its pods.
            </p>
          )}
          <div className="layer-controls" aria-label="Visual layers">
            {(['network', 'storage', 'capacity'] as const).map((layer) => (
              <button
                key={layer}
                className="subtle-button"
                aria-pressed={layers[layer]}
                onClick={() => {
                  if (layer === 'storage' && !layers.storage)
                    setStoragePod(current?.kind === 'Pod' ? current.id : (current?.parent ?? null))
                  setLayers((value) => ({ ...value, [layer]: !value[layer] }))
                }}
              >
                {layer === 'capacity'
                  ? 'CPU & memory'
                  : layer === 'storage'
                    ? 'Show storage'
                    : 'Advanced networking'}
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
                    summaries={summaries}
                    nodeSummaries={nodeSummaries}
                    groupMembers={selectedGroup?.pods.map((p) => p.id)}
                    selected={selected}
                    matching={visible.map((r) => r.id)}
                    focusRevision={focusRevision}
                    motion={!paused && !reducedMotion && !live.stale}
                    fresh={fresh}
                    onSelect={select}
                    layers={layers}
                    overview={!selected && kind === 'All' && query === '' && !onlyIssues}
                    endpointsFresh={
                      !live.stale &&
                      snapshot.visibility.some(
                        (v) => v.kind === 'EndpointSlice' && v.state === 'observing',
                      )
                    }
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
            {layout.rooms.length} node rooms · {layout.totalPods} pods ·{' '}
            {resources.filter((r) => r.kind === 'Container').length} containers
            {snapshot && (live.stale || snapshot.connection !== 'connected')
              ? ' · some observations retained; check freshness'
              : ''}
            {' · '}
            {resources.filter((r) => r.kind === 'Service').length} services
          </div>
          <HabitatMap layout={layout} summaries={nodeSummaries} onSelect={select} />
          <ActivityPanel
            activity={activity}
            onSelect={select}
            ids={new Set(allResources.map((r) => r.id))}
          />
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
            {[...new Set(resources.filter((r) => r.kind === 'Pod').map((p) => p.namespace ?? ''))]
              .filter(Boolean)
              .map((name) => (
                <button
                  key={name}
                  className="text-link"
                  onClick={() => {
                    setNamespace(name)
                    reset()
                  }}
                >
                  <i style={{ background: namespaceColor(name) }} />
                  {name}
                </button>
              ))}
          </div>
          <div
            className="namespace-legend service-color-legend"
            aria-label="Service uniform colours"
          >
            <span className="scope-note">Service uniforms</span>
            {resources
              .filter((r) => r.kind === 'Service')
              .map((service) => (
                <button key={service.id} className="text-link" onClick={() => select(service.id)}>
                  <i style={{ background: serviceColor(service) }} />
                  {service.name}
                </button>
              ))}
          </div>
          <p className="scope-note scene-note">
            Floor rings show namespace membership across rooms. Room size reflects object placement,
            not CPU or memory capacity. Healthy motion requires fresh Pod Ready observations.
          </p>
          <p className="scope-note scene-note">
            Uniform colours match the badges on each Service’s destination pods and its route links.
            A pod served by several Services has several badges. Pod health colours and namespace
            floor rings keep their own meanings. Walking is ambient routing animation.
          </p>
          {layers.network && (
            <section className="network-check" aria-label="Pod network policy check">
              <p className="scope-note">
                A Service is the entry point to its pods. EndpointSlices record its destinations.
                Ingress defines incoming routes to Services. Network policies describe allowed
                connections.
              </p>
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
          )}
        </section>
        <aside className="details" aria-label="Live component details" aria-live="polite">
          <div className="panel-heading">
            <h2>Inspector</h2>
            <span>KUBERNETES</span>
          </div>
          {selectedGroup ? (
            <WorkloadInspector
              group={selectedGroup}
              summary={summaries.get(selectedGroup.id)!}
              page={replicaPage}
              onPage={(page) => openGroup(selectedGroup.id, page)}
              onSelect={select}
              fresh={fresh}
              children={children}
            />
          ) : current ? (
            <>
              <span className="eyebrow detail-kind">{current.kind}</span>
              <h3>{current.name}</h3>
              {current.kind === 'Node' && <SummaryText value={nodeSummaries.get(current.name)!} />}
              <span className={`state-badge ${signal(current)}`}>
                {fresh(current) ? current.state : 'Unknown freshness'}
              </span>
              {!fresh(current) && (
                <p className="detail-description">
                  Last observed state: {current.state}. This is retained data, not a current health
                  verdict.
                </p>
              )}
              <details className="identity-disclosure">
                <summary>Identity, placement &amp; observation</summary>
                <dl>
                  {(
                    [
                      ['UID', current.uid],
                      ['Object ID', current.id],
                      ['Resource version', current.resourceVersion],
                      ['Observed at', stamp(current.observedAt)],
                      ['Namespace', current.namespace],
                      ['Assigned node', current.nodeName],
                      [current.kind === 'Pod' ? 'Pod phase' : 'Phase', current.phase],
                      [
                        current.kind === 'Container' ? 'Container ready' : 'Ready condition',
                        !['Node', 'Pod', 'Container'].includes(current.kind)
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
              </details>
              {current.kind === 'Pod' && (
                <section className="relationship-list">
                  <h4>Inside this pod</h4>
                  {resources
                    .filter((r) => r.parent === current.id && r.kind === 'Container')
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
              {current.kind === 'Pod' && (
                <section className="relationship-list">
                  <h4>Services serving this pod</h4>
                  {podServices(layout, current.id).map((service) => (
                    <button
                      key={service.id}
                      className="text-link"
                      onClick={() => select(service.id)}
                    >
                      <span style={{ color: serviceColor(service) }} aria-hidden="true">
                        ●{' '}
                      </span>
                      {service.name}
                    </button>
                  ))}
                  {podServices(layout, current.id).length === 0 && (
                    <p className="scope-note">No Service-to-pod destinations observed.</p>
                  )}
                </section>
              )}
              {current.kind === 'Pod' && (
                <section className="pod-storage-details">
                  <h4>Storage attached to this pod</h4>
                  <button className="subtle-button" onClick={() => showPodStorage(current.id)}>
                    Explore this pod’s storage
                  </button>
                  {resources
                    .filter((r) => r.kind === 'Volume' && r.parent === current.id)
                    .map((volume) => {
                      const facts = storageFacts(allResources, volume)
                      return (
                        <div className="storage-card" key={volume.id}>
                          <button className="text-link" onClick={() => select(volume.id)}>
                            {volume.name}
                          </button>
                          <small>
                            {facts.type}
                            {facts.medium ? ` · ${facts.medium}` : ''}
                          </small>
                          <dl>
                            <div>
                              <dt>Min requested</dt>
                              <dd>{facts.minimum}</dd>
                            </div>
                            <div>
                              <dt>Capacity</dt>
                              <dd>{facts.capacity}</dd>
                            </div>
                            <div>
                              <dt>Max limit</dt>
                              <dd>{facts.maximum}</dd>
                            </div>
                          </dl>
                          <small>ID: {facts.shortId}</small>
                          {facts.claim && (
                            <button className="text-link" onClick={() => select(facts.claim!.id)}>
                              Claim: {facts.claim.name}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  {!resources.some((r) => r.kind === 'Volume' && r.parent === current.id) && (
                    <p className="scope-note">
                      No volume attachments observed. Container writable layers are separate from
                      pod volumes.
                    </p>
                  )}
                  <p className="scope-note">
                    Min requested is a PVC allocation request. Capacity is provisioned size. Max is
                    shown only when an explicit volume limit exists. Usage is not measured here.
                  </p>
                </section>
              )}
              {current.kind === 'Service' && (
                <section className="relationship-list">
                  <h4>Configured pod destinations</h4>
                  <p className="scope-note">
                    This walking guide represents a stable entry point for its pods. Walking is an
                    ambient illustration, not measured traffic or security enforcement. Destinations
                    come from EndpointSlices; this does not prove application traffic.
                  </p>
                  {layout.edges
                    .filter(
                      (edge) =>
                        edge.from === current.id &&
                        allResources.find((r) => r.id === edge.to)?.kind === 'Pod',
                    )
                    .map((edge) => {
                      const pod = allResources.find((r) => r.id === edge.to)!
                      return (
                        <div key={edge.to}>
                          <button className="text-link" onClick={() => select(pod.id)}>
                            {pod.name}
                          </button>
                          <small>
                            {fresh(current) &&
                            fresh(pod) &&
                            snapshot?.visibility.some(
                              (v) => v.kind === 'EndpointSlice' && v.state === 'observing',
                            )
                              ? edge.relation
                              : 'Destination freshness unknown'}
                          </small>
                        </div>
                      )
                    })}
                  {!layout.edges.some(
                    (edge) =>
                      edge.from === current.id &&
                      allResources.find((r) => r.id === edge.to)?.kind === 'Pod',
                  ) && (
                    <p className="scope-note">
                      No pod destinations observed. A service can target external endpoints or have
                      no ready pod backends.
                    </p>
                  )}
                </section>
              )}
              {current.kind === 'Namespace' && (
                <section className="relationship-list">
                  <h4>Inside this namespace</h4>
                  {resources
                    .filter(
                      (r) => r.namespace === current.name && ['Pod', 'Service'].includes(r.kind),
                    )
                    .map((r) => (
                      <div key={r.id}>
                        <small>{r.kind}</small>
                        <button className="text-link" onClick={() => select(r.id)}>
                          {r.name}
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
                  {['Pod', 'Container'].includes(current.kind)
                    ? 'Pod readiness, container state and application health are different. A container restart retains its pod UID; a replacement has a new UID.'
                    : 'These are observed Kubernetes objects. Configuration and capacity do not prove application health or measured resource usage.'}
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
