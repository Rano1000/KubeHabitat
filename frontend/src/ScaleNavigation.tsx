import { useState } from 'react'
import type { LiveResource } from './useClusterSnapshot'
import type { WorkloadGroup, Summary, Activity, ScaleLayout } from './scaleModel'
import { REPLICA_PAGE } from './scaleModel'
import { needsInvestigation } from './lifecycle'

export function SummaryText({ value }: { value: Summary }) {
  return (
    <span className="group-summary">
      {value.total} pods · {value.ready} ready
      {value.warning > 0 && <b className="warning-text"> · {value.warning} need investigation</b>}
      {value.unknown > 0 && <b className="unknown-text"> · {value.unknown} unknown</b>}
      {value.completed > 0 && <> · {value.completed} completed</>}
    </span>
  )
}

export function WorkloadNavigator({
  groups,
  summaries,
  onOpen,
  expanded,
}: {
  groups: WorkloadGroup[]
  summaries: Map<string, Summary>
  onOpen: (id: string, page?: number) => void
  expanded: boolean
}) {
  const [page, setPage] = useState(0)
  const current = Math.min(page, Math.max(0, Math.ceil(groups.length / 8) - 1))
  return (
    <details className="component-disclosure workload-disclosure" open={expanded}>
      <summary>
        Workload groups <span>{groups.length}</span>
      </summary>
      <p className="scope-note">
        Grouped by observed controller or explicit application label, within each node.
      </p>
      <div className="workload-list">
        {groups.slice(current * 8, (current + 1) * 8).map((g) => (
          <button key={g.id} className="workload-item" onClick={() => onOpen(g.id)}>
            <strong>{g.name}</strong>
            <small>
              {g.namespace} · {g.nodeName || 'Waiting area'} · {g.basis}
            </small>
            <SummaryText value={summaries.get(g.id)!} />
          </button>
        ))}
      </div>
      {groups.length > 8 && (
        <div className="pagination">
          <button
            className="subtle-button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous groups
          </button>
          <span>
            {current + 1} / {Math.ceil(groups.length / 8)}
          </span>
          <button
            className="subtle-button"
            disabled={(current + 1) * 8 >= groups.length}
            onClick={() => setPage(current + 1)}
          >
            Next groups
          </button>
        </div>
      )}
    </details>
  )
}

export function WorkloadInspector({
  group,
  summary,
  page,
  onPage,
  onSelect,
  fresh,
  children,
}: {
  group: WorkloadGroup
  summary: Summary
  page: number
  onPage: (page: number) => void
  onSelect: (id: string) => void
  fresh: (r: LiveResource) => boolean
  children: Map<string, LiveResource[]>
}) {
  const pages = Math.max(1, Math.ceil(group.pods.length / REPLICA_PAGE))
  const current = Math.min(page, pages - 1)
  return (
    <section className="workload-inspector" aria-label="Workload group details">
      <span className="eyebrow">
        {group.basis === 'controller'
          ? 'OBSERVED CONTROLLER'
          : group.basis === 'label'
            ? 'APPLICATION LABEL GROUP'
            : 'STANDALONE POD'}
      </span>
      <h3>{group.name}</h3>
      <SummaryText value={summary} />
      <p className="scope-note">
        {group.namespace} · {group.nodeName || 'Node not observed / unscheduled'}
      </p>
      {group.basis === 'label' && (
        <p className="scope-note">
          Shared labels do not prove these pods are replicas of one controller.
        </p>
      )}
      <div className="issue-shortcuts">
        {group.pods
          .filter(
            (p) =>
              needsInvestigation(p, fresh(p)) ||
              children.get(p.id)?.some((c) => needsInvestigation(c, fresh(c))),
          )
          .slice(0, 8)
          .map((p) => (
            <button key={p.id} className="subtle-button" onClick={() => onSelect(p.id)}>
              Investigate {p.name}
            </button>
          ))}
      </div>
      <p className="scope-note">
        Showing {current * REPLICA_PAGE + 1}–
        {Math.min((current + 1) * REPLICA_PAGE, group.pods.length)} of {group.pods.length} pods.
        Every member remains inspectable.
      </p>
      <div className="relationship-list">
        {group.pods.slice(current * REPLICA_PAGE, (current + 1) * REPLICA_PAGE).map((p) => (
          <button className="text-link" key={p.id} onClick={() => onSelect(p.id)}>
            {p.name} · {fresh(p) ? p.state : 'Unknown freshness'}
          </button>
        ))}
      </div>
      {pages > 1 && (
        <div className="pagination">
          <button
            className="subtle-button"
            disabled={current === 0}
            onClick={() => onPage(current - 1)}
          >
            Previous replicas
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            className="subtle-button"
            disabled={current + 1 === pages}
            onClick={() => onPage(current + 1)}
          >
            Next replicas
          </button>
        </div>
      )}
    </section>
  )
}

export function HabitatMap({
  layout,
  onSelect,
  summaries,
}: {
  layout: ScaleLayout
  onSelect: (id: string) => void
  summaries: Map<string, Summary>
}) {
  const [page, setPage] = useState(0)
  const current = Math.min(page, Math.max(0, Math.ceil(layout.rooms.length / 64) - 1))
  const rooms = layout.rooms.slice(current * 64, (current + 1) * 64)
  return (
    <details className="habitat-minimap">
      <summary>Node map · {layout.rooms.length} rooms</summary>
      <div className="minimap-grid">
        {rooms.map((room) => {
          const summary = summaries.get(room.resource.name)
          return (
            <button
              key={room.resource.id}
              className={`minimap-room ${summary?.warning ? 'has-warning' : ''}`}
              onClick={() => onSelect(room.resource.id)}
            >
              <strong>{room.resource.name}</strong>
              <small>
                {summary?.total ?? 0} pods · {summary?.warning ?? 0} investigate ·{' '}
                {summary?.unknown ?? 0} unknown
              </small>
            </button>
          )
        })}
      </div>
      {layout.rooms.length > 64 && (
        <div className="pagination">
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            Previous nodes
          </button>
          <span>{current + 1}</span>
          <button
            disabled={(current + 1) * 64 >= layout.rooms.length}
            onClick={() => setPage(current + 1)}
          >
            Next nodes
          </button>
        </div>
      )}
    </details>
  )
}

export function ActivityPanel({
  activity,
  onSelect,
  ids,
}: {
  activity: Activity[]
  onSelect: (id: string) => void
  ids: Set<string>
}) {
  return (
    <details className="activity-panel">
      <summary>Observed activity · {activity.length}</summary>
      <p className="scope-note">
        Last 20 changes seen in this browser session. Gaps, initial connection and reconnects are
        not incident history.
      </p>
      {activity.length === 0 && (
        <p className="scope-note">
          Listening for observed pod states, container restarts and inventory changes.
        </p>
      )}
      <ol>
        {activity.map((item) => (
          <li key={item.id}>
            <time>{new Date(item.at).toLocaleTimeString()}</time>{' '}
            {ids.has(item.resourceId) ? (
              <button className="text-link" onClick={() => onSelect(item.resourceId)}>
                {item.name}
              </button>
            ) : (
              <strong>{item.name}</strong>
            )}
            <small>{item.message}</small>
          </li>
        ))}
      </ol>
    </details>
  )
}
