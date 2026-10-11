import { useEffect, useState } from 'react'
import type { LiveResource } from './useClusterSnapshot'
import { ownerChain, appendMetricPoint, metricSegments } from './workloadEvidenceModel'
import type { MetricPoint } from './workloadEvidenceModel'

export function OwnershipCard({
  resource,
  resources,
  fresh,
  onSelect,
}: {
  resource: LiveResource
  resources: LiveResource[]
  fresh: (r: LiveResource) => boolean
  onSelect: (id: string) => void
}) {
  const chain = ownerChain(resource, resources)
  return (
    <section className="ownership-card" aria-label="Workload ownership">
      <h4>Workload ownership</h4>
      {chain.length ? (
        <ol>
          {chain.map((step) => (
            <li key={`${step.kind}:${step.uid}`}>
              <small>{step.kind}</small>
              {step.resource ? (
                <button className="text-link" onClick={() => onSelect(step.resource!.id)}>
                  {step.name}
                </button>
              ) : (
                <span>{step.name} · not observed</span>
              )}
              <span className="scope-note">
                {step.resource
                  ? fresh(step.resource)
                    ? 'Observed UID reference'
                    : 'Cached · freshness unknown'
                  : 'Reference only · visibility or object unavailable'}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="scope-note">
          No controlling owner reference was observed. A matching name or label does not establish
          ownership.
        </p>
      )}
    </section>
  )
}

export function MetricsCard({
  resource,
  fresh,
  reason,
}: {
  resource: LiveResource
  fresh: boolean
  reason?: string
}) {
  const [points, setPoints] = useState<MetricPoint[]>([])
  const usage = fresh ? resource.usage : undefined
  useEffect(() => {
    setPoints((items) => appendMetricPoint(items, usage, Date.now()))
  }, [usage, fresh])
  const segments = metricSegments(points)
  const samples = segments.flat()
  const first = samples.at(0)?.at ?? 0,
    last = samples.at(-1)?.at ?? 0
  const chart = (key: 'cpu' | 'memory', unit: string) => {
    const max = Math.max(...samples.map((p) => p[key]), 1)
    const x = (at: number) => 6 + ((at - first) / Math.max(last - first, 1)) * 268
    const y = (value: number) => 58 - (value / max) * 46
    return (
      <div className="metric-trend">
        <small>
          {key === 'cpu' ? 'CPU' : 'Memory working set'} · peak{' '}
          {Math.max(...samples.map((p) => p[key]), 0).toFixed(1)} {unit}
        </small>
        <svg
          viewBox="0 0 280 70"
          role="img"
          aria-label={`${key === 'cpu' ? 'CPU' : 'Memory'} sample history in ${unit}`}
        >
          <path d="M6 58H274" className="trend-baseline" />
          {segments.map((segment, i) => (
            <g key={i}>
              <polyline
                points={segment.map((p) => `${x(p.at)},${y(p[key])}`).join(' ')}
                className={`trend-line ${key}`}
              />
              {segment.map((p) => (
                <circle
                  key={p.at}
                  cx={x(p.at)}
                  cy={y(p[key])}
                  r="2.5"
                  className={`trend-dot ${key}`}
                >
                  <title>
                    {new Date(p.at).toLocaleTimeString()} · {p[key].toFixed(1)} {unit} · window{' '}
                    {p.window}
                  </title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
      </div>
    )
  }
  return (
    <section className="usage-card" aria-label="Resource metrics">
      <h4>Measured usage</h4>
      {usage ? (
        <>
          <div className="usage-values">
            <div>
              <span>CPU</span>
              <strong>{usage.cpuMilli} mCPU</strong>
            </div>
            <div>
              <span>Memory working set</span>
              <strong>{(usage.memoryBytes / 1048576).toFixed(1)} MiB</strong>
            </div>
          </div>
          <p className="scope-note">
            Kubernetes Metrics API · {new Date(usage.timestamp).toLocaleTimeString()} · CPU
            averaging window {usage.window}. Memory is the reported working set.
          </p>
        </>
      ) : (
        <p className="scope-note">
          Usage unknown. {reason ?? 'Metrics API samples are unavailable.'}
        </p>
      )}
      {samples.length > 0 && (
        <>
          <div className="metric-trends">
            {chart('cpu', 'mCPU')}
            {chart('memory', 'MiB')}
          </div>
          <p className="scope-note">
            {samples.length} samples · {new Date(first).toLocaleTimeString()}–
            {new Date(last).toLocaleTimeString()}. Collected while this inspector is open, up to
            five minutes. Gaps break the line; there is no stored history.{' '}
            {!usage && 'Prior samples are retained evidence, not current usage.'}
          </p>
        </>
      )}
      {resource.kind === 'Container' && (
        <dl className="metric-config">
          {['request cpu', 'limit cpu', 'request memory', 'limit memory'].map((key) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{resource.details?.[key] ?? 'Not specified'}</dd>
            </div>
          ))}
        </dl>
      )}
      {resource.kind === 'Node' && (
        <dl className="metric-config">
          {['capacity cpu', 'allocatable cpu', 'capacity memory', 'allocatable memory'].map(
            (key) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{resource.details?.[key] ?? 'Not observed'}</dd>
              </div>
            ),
          )}
        </dl>
      )}
      <p className="scope-note">
        Requests reserve scheduling resources; limits and node capacity are configuration, separate
        from consumption. Usage does not prove readiness.
      </p>
    </section>
  )
}
