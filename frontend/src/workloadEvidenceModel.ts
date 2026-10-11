import type { LiveResource } from './useClusterSnapshot'

export type OwnerStep = { kind: string; name: string; uid: string; resource?: LiveResource }

// Resolve controlling references by UID, kind and namespace. Names alone are not identity.
export function ownerChain(resource: LiveResource, resources: LiveResource[]) {
  const steps: OwnerStep[] = []
  const visited = new Set([resource.id])
  let current = resource
  if (current.kind === 'Container' && current.parent) {
    const parent = resources.find((r) => r.id === current.parent && r.kind === 'Pod')
    if (!parent) return [{ kind: 'Pod', name: 'Parent not observed', uid: current.uid }]
    steps.push({ kind: parent.kind, name: parent.name, uid: parent.uid, resource: parent })
    visited.add(parent.id)
    current = parent
  }
  while (current.owner && steps.length < 12) {
    const owner = current.owner
    const target = resources.find(
      (r) => r.uid === owner.uid && r.kind === owner.kind && r.namespace === current.namespace,
    )
    if (target && visited.has(target.id)) break
    steps.push({ ...owner, resource: target })
    if (!target) break
    visited.add(target.id)
    current = target
  }
  return steps
}

export type MetricPoint =
  { at: number; cpu: number; memory: number; window: string } | { at: number; gap: true }
export function appendMetricPoint(
  points: MetricPoint[],
  usage: LiveResource['usage'],
  now: number,
): MetricPoint[] {
  const last = points.at(-1)
  if (!usage) {
    if (!last || 'gap' in last) return points
    return [...points, { at: now, gap: true as const }].slice(-40)
  }
  const at = Date.parse(usage.timestamp)
  if (!Number.isFinite(at) || at > now + 5000 || now - at > 90000 || (last && at <= last.at))
    return points
  return [
    ...points,
    { at, cpu: usage.cpuMilli, memory: usage.memoryBytes / 1048576, window: usage.window },
  ]
    .filter((p) => now - p.at <= 5 * 60_000)
    .slice(-40)
}

export function metricSegments(points: MetricPoint[]) {
  const segments: Exclude<MetricPoint, { gap: true }>[][] = []
  let segment: Exclude<MetricPoint, { gap: true }>[] = []
  for (const point of points) {
    if ('gap' in point) {
      if (segment.length) segments.push(segment)
      segment = []
      continue
    }
    if (segment.length && point.at - segment.at(-1)!.at > 45_000) {
      segments.push(segment)
      segment = []
    }
    segment.push(point)
  }
  if (segment.length) segments.push(segment)
  return segments
}
