import type { LiveResource, ClusterSnapshot } from './useClusterSnapshot'
import { buildHabitatLayout } from './habitatLayout.ts'
import { matches } from './networkPolicy.ts'
import { servicePatrol } from './serviceGuide.ts'
import type { HabitatLayout, Point } from './habitatLayout'

export const REPLICA_PAGE = 48
export const INVENTORY_PAGE = 60
export type WorkloadGroup = {
  id: string
  name: string
  namespace: string
  nodeName: string
  basis: 'controller' | 'label' | 'standalone'
  pods: LiveResource[]
}
export type Summary = {
  total: number
  ready: number
  warning: number
  unknown: number
  completed: number
}
export type GroupPlacement = { group: WorkloadGroup; position: Point; hidden: number }
export type ScaleLayout = HabitatLayout & {
  groups: GroupPlacement[]
  totalPods: number
  totalContainers: number
}

export function warning(r: LiveResource) {
  return (
    ['NotReady', 'Failed', 'Waiting', 'Pending', 'Unscheduled', 'Lost'].includes(r.state) ||
    (r.state === 'Terminated' && r.exitCode !== undefined && r.exitCode !== 0) ||
    (r.state === 'Running' && r.ready === false)
  )
}

export function application(r: LiveResource) {
  const name = r.labels?.['app.kubernetes.io/name'] ?? r.labels?.app
  const instance = r.labels?.['app.kubernetes.io/instance']
  return name ? `${r.namespace ?? ''}/${instance ? `${instance}:` : ''}${name}` : ''
}

// Never derive controllers by trimming pod names. Label groups are explicitly labelled.
export function workloadGroups(resources: LiveResource[]) {
  const groups = new Map<string, WorkloadGroup>()
  for (const pod of resources) {
    if (pod.kind !== 'Pod') continue
    const app = application(pod)
    const basis = pod.owner ? 'controller' : app ? 'label' : 'standalone'
    const identity = pod.owner?.uid ?? (app || pod.id)
    const id = `workload:${JSON.stringify([pod.namespace ?? '', pod.nodeName ?? '', basis, identity])}`
    let group = groups.get(id)
    if (!group) {
      group = {
        id,
        name: pod.owner ? `${pod.owner.kind}/${pod.owner.name}` : app || pod.name,
        namespace: pod.namespace ?? '',
        nodeName: pod.nodeName ?? '',
        basis,
        pods: [],
      }
      groups.set(id, group)
    }
    group.pods.push(pod)
  }
  return [...groups.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((group) => ({
      ...group,
      pods: group.pods.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    }))
}

export function containerIndex(resources: LiveResource[]) {
  const children = new Map<string, LiveResource[]>()
  for (const r of resources)
    if (r.kind === 'Container' && r.parent) {
      const bucket = children.get(r.parent) ?? []
      bucket.push(r)
      children.set(r.parent, bucket)
    }
  return children
}
export function healthSummary(
  pods: LiveResource[],
  resources: LiveResource[],
  fresh: (r: LiveResource) => boolean,
  children = containerIndex(resources),
): Summary {
  const result: Summary = { total: pods.length, ready: 0, warning: 0, unknown: 0, completed: 0 }
  for (const pod of pods) {
    const containers = children.get(pod.id) ?? []
    if (!fresh(pod) || containers.some((c) => !fresh(c))) result.unknown++
    else if (warning(pod) || containers.some(warning)) result.warning++
    else if (pod.state === 'Completed') result.completed++
    else if (pod.ready === true && pod.state === 'Ready' && !pod.deleting) result.ready++
    else result.unknown++
  }
  return result
}

// Scope applications by explicit labels; retain reference-only dependencies without pretending
// they have the same application label. Namespace and node assignments are untouched.
export function applicationScope(resources: LiveResource[], key: string) {
  if (!key) return resources
  const ids = new Set(resources.filter((r) => application(r) === key).map((r) => r.id))
  const byId = new Map(resources.map((r) => [r.id, r]))
  const targets = new Map<string, LiveResource>()
  for (const r of resources) {
    targets.set(`${r.kind}/uid/${r.uid}`, r)
    targets.set(`${r.kind}/id/${r.id}`, r)
    targets.set(`${r.kind}/name/${r.namespace ?? ''}/${r.name}`, r)
  }
  const resolve = (link: NonNullable<LiveResource['links']>[number]) =>
    link.uid
      ? (targets.get(`${link.kind}/id/${link.uid}`) ?? targets.get(`${link.kind}/uid/${link.uid}`))
      : targets.get(`${link.kind}/name/${link.namespace ?? ''}/${link.name}`)
  // EndpointSlice->Pod and EndpointSlice->Service references establish serving relationships.
  for (const slice of resources.filter((r) => r.kind === 'EndpointSlice')) {
    if (slice.links?.some((l) => l.kind === 'Pod' && ids.has(resolve(l)?.id ?? ''))) {
      ids.add(slice.id)
      for (const link of slice.links ?? [])
        if (link.kind === 'Service') {
          const target = resolve(link)
          if (target) ids.add(target.id)
        }
    }
  }
  for (const r of resources) if (r.parent && ids.has(r.parent)) ids.add(r.id)
  const pending = [...ids]
  for (let i = 0; i < pending.length; i++)
    for (const link of byId.get(pending[i])?.links ?? []) {
      const target = resolve(link)
      // Do not pull unrelated endpoint pods into an application merely because it shares a Service.
      if (target && !['Pod', 'Container'].includes(target.kind) && !ids.has(target.id)) {
        ids.add(target.id)
        pending.push(target.id)
      }
    }
  return resources.filter((r) => r.kind === 'Node' || r.kind === 'Namespace' || ids.has(r.id))
}

export function scalableLayout(
  resources: LiveResource[],
  objectIds: ReadonlySet<string>,
  compact: boolean,
  expanded: string | null,
  page: number,
  selected: string | null,
): ScaleLayout {
  const groups = workloadGroups(resources)
  const totalPods = groups.reduce((sum, g) => sum + g.pods.length, 0)
  const totalContainers = resources.filter((r) => r.kind === 'Container').length
  if (!compact)
    return {
      ...buildHabitatLayout(resources, { objectIds }),
      groups: [],
      totalPods,
      totalContainers,
    }
  const revealed = new Set<string>()
  const proxies: LiveResource[] = []
  const hiddenGroups = new Map<string, { group: WorkloadGroup; hidden: LiveResource[] }>()
  const selectedResource = resources.find((r) => r.id === selected)
  const selectedPodId =
    selectedResource?.kind === 'Pod' ? selectedResource.id : selectedResource?.parent
  for (const group of groups) {
    const currentPage = Math.max(0, Math.min(page, Math.ceil(group.pods.length / REPLICA_PAGE) - 1))
    const members =
      group.id === expanded
        ? group.pods.slice(currentPage * REPLICA_PAGE, (currentPage + 1) * REPLICA_PAGE)
        : []
    for (const pod of members) revealed.add(pod.id)
    const focused = group.pods.find((p) => p.id === selectedPodId)
    if (focused) revealed.add(focused.id)
    const hidden = group.pods.filter((p) => !revealed.has(p.id))
    if (hidden.length) {
      // A proxy is a visual aggregate only. It is never added to the API inventory or counted as a pod.
      proxies.push({
        ...hidden[0],
        id: group.id,
        uid: group.id,
        name: group.name,
        ready: undefined,
        state: 'Unknown',
      })
      hiddenGroups.set(group.id, { group, hidden })
    }
  }
  const geometryResources = resources.filter((r) =>
    r.kind === 'Pod'
      ? revealed.has(r.id)
      : r.kind === 'Container'
        ? revealed.has(r.parent ?? '')
        : true,
  )
  const base = buildHabitatLayout([...geometryResources, ...proxies], { objectIds })
  const placements: GroupPlacement[] = []
  for (const [id, { group, hidden }] of hiddenGroups) {
    const position = base.positions.get(id)!
    placements.push({ group, position, hidden: hidden.length })
    for (const pod of hidden) base.positions.set(pod.id, position)
  }
  for (const r of resources)
    if (r.parent && !base.positions.has(r.id)) {
      const position = base.positions.get(r.parent)
      if (position) base.positions.set(r.id, position)
    }
  for (const group of groups)
    if (!base.positions.has(group.id)) {
      const points = group.pods.map((p) => base.positions.get(p.id)).filter((p): p is Point => !!p)
      if (points.length) base.positions.set(group.id, points[0])
    }
  base.pods = base.pods.filter((p) => !hiddenGroups.has(p.resource.id))
  base.rooms = base.rooms.map((room) => ({
    ...room,
    pods: base.pods.filter((p) => p.resource.nodeName === room.resource.name),
  }))
  base.resources = resources
  // Relationships refer to real identities, even when their geometry is collapsed.
  const index = new Map<string, LiveResource>()
  for (const r of resources) {
    index.set(`${r.kind}/uid/${r.uid}`, r)
    index.set(`${r.kind}/uid/${r.id}`, r)
    index.set(`${r.kind}/name/${r.namespace ?? ''}/${r.name}`, r)
  }
  base.edges = []
  const sliceEdges = new Map<string, typeof base.edges>()
  for (const r of resources)
    for (const link of r.links ?? []) {
      const target = index.get(
        link.uid
          ? `${link.kind}/uid/${link.uid}`
          : `${link.kind}/name/${link.namespace ?? ''}/${link.name}`,
      )
      if (!target) continue
      const edge = { from: r.id, to: target.id, relation: link.relation }
      base.edges.push(edge)
      if (r.kind === 'EndpointSlice') {
        const bucket = sliceEdges.get(r.id) ?? []
        bucket.push(edge)
        sliceEdges.set(r.id, bucket)
      }
    }
  const byId = new Map(resources.map((r) => [r.id, r]))
  for (const links of sliceEdges.values()) {
    const service = links.find((e) => byId.get(e.to)?.kind === 'Service')
    if (service)
      for (const endpoint of links.filter((e) => byId.get(e.to)?.kind === 'Pod'))
        base.edges.push({ ...endpoint, from: service.to })
  }
  for (const policy of resources.filter((r) => r.kind === 'NetworkPolicy' && r.policy))
    for (const pod of resources.filter((r) => r.kind === 'Pod'))
      if (
        pod.namespace === policy.namespace &&
        matches(policy.policy!.podSelector, pod.labels) === true
      )
        base.edges.push({ from: policy.id, to: pod.id, relation: 'policy selects pod' })
  for (const object of base.objects.filter((o) => o.resource.kind === 'Service')) {
    object.position = servicePatrol(base, object.resource.id).points[0]
    base.positions.set(object.resource.id, object.position)
  }
  return { ...base, groups: placements, totalPods, totalContainers }
}

export type Activity = { id: string; resourceId: string; name: string; message: string; at: string }
export function observedChanges(before: ClusterSnapshot | null, next: ClusterSnapshot): Activity[] {
  if (!before || before.sessionId !== next.sessionId) return []
  const old = new Map(before.resources.filter((r) => r.kind === 'Pod').map((r) => [r.id, r]))
  const changes: Activity[] = []
  const podVisible = next.visibility.find((v) => v.kind === 'Pod')?.state === 'observing'
  if (!podVisible || before.visibility.find((v) => v.kind === 'Pod')?.state !== 'observing')
    return []
  for (const pod of next.resources.filter((r) => r.kind === 'Pod')) {
    const previous = old.get(pod.id)
    old.delete(pod.id)
    const message = !previous
      ? 'Appeared in observed inventory'
      : previous.state !== pod.state
        ? `Observed state: ${previous.state} → ${pod.state}`
        : ''
    if (message)
      changes.push({
        id: `${next.revision}:${pod.id}`,
        resourceId: pod.id,
        name: `${pod.namespace}/${pod.name}`,
        message,
        at: next.generatedAt,
      })
  }
  for (const pod of old.values())
    changes.push({
      id: `${next.revision}:${pod.id}`,
      resourceId: pod.id,
      name: `${pod.namespace}/${pod.name}`,
      message: 'Left observed inventory; cause not inferred',
      at: next.generatedAt,
    })
  return changes
}
