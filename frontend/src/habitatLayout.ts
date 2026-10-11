import type { LiveResource } from './useClusterSnapshot'
import { matches } from './networkPolicy.ts'
import { servicePatrol } from './serviceGuide.ts'

export type Point = [number, number, number]
export type PlacedContainer = { resource: LiveResource; position: Point; offset: Point }
export type PlacedPod = {
  resource: LiveResource
  position: Point
  radius: number
  containers: PlacedContainer[]
}
export type Room = {
  resource: LiveResource
  position: Point
  width: number
  depth: number
  pods: PlacedPod[]
}
export type HabitatLayout = {
  resources: LiveResource[]
  rooms: Room[]
  pods: PlacedPod[]
  looseContainers: PlacedContainer[]
  waiting: { position: Point; width: number; depth: number } | null
  positions: Map<string, Point>
  width: number
  depth: number
  objects: { resource: LiveResource; position: Point }[]
  edges: { from: string; to: string; relation: string }[]
}

const ordered = (items: LiveResource[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

export function namespaceColor(name: string) {
  let hash = 0
  for (const letter of name) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0
  return ['#67dacf', '#7aaef0', '#c1a4ed', '#e4be77', '#ee9fa9', '#94c98f'][hash % 6]
}

// Geometry depends only on observed identities and relationships, never on authored fixtures.
export function buildHabitatLayout(
  resources: LiveResource[],
  options?: { objectIds: ReadonlySet<string> },
): HabitatLayout {
  const nodes = ordered(resources.filter((r) => r.kind === 'Node'))
  const podResources = ordered(resources.filter((r) => r.kind === 'Pod'))
  const containers = ordered(resources.filter((r) => r.kind === 'Container'))
  const childrenByPod = new Map<string, LiveResource[]>()
  const podsByNode = new Map<string, LiveResource[]>()
  const byId = new Map(resources.map((r) => [r.id, r]))
  const referenceIndex = new Map<string, LiveResource>()
  for (const r of resources) {
    if (r.parent) {
      const children = childrenByPod.get(r.parent) ?? []
      children.push(r)
      childrenByPod.set(r.parent, children)
    }
    if (r.kind === 'Pod') {
      const members = podsByNode.get(r.nodeName ?? '') ?? []
      members.push(r)
      podsByNode.set(r.nodeName ?? '', members)
    }
    referenceIndex.set(JSON.stringify([r.kind, 'uid', r.uid]), r)
    referenceIndex.set(JSON.stringify([r.kind, 'uid', r.id]), r)
    referenceIndex.set(JSON.stringify([r.kind, 'name', r.namespace ?? '', r.name]), r)
  }
  const podContainers = (id: string) =>
    (childrenByPod.get(id) ?? []).filter((r) => r.kind === 'Container')
  const radius = (pod: LiveResource) =>
    Math.max(0.76, 0.38 + Math.sqrt(podContainers(pod.id).length) * 0.3)
  function dimensions(pods: LiveResource[]) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(pods.length)))
    const rows = Math.max(1, Math.ceil(pods.length / columns))
    const cell = Math.max(2.15, ...pods.map((p) => radius(p) * 2 + 0.75))
    return {
      columns,
      rows,
      cell,
      width: Math.max(4.8, columns * cell + 1.1),
      depth: Math.max(4.8, rows * cell + 1.5),
    }
  }
  const nodeNames = new Set(nodes.map((n) => n.name))
  const unplaced = podResources.filter((p) => !p.nodeName || !nodeNames.has(p.nodeName))
  const podIds = new Set(podResources.map((p) => p.id))
  const orphanContainers = containers.filter((c) => !c.parent || !podIds.has(c.parent))
  const waitingNeeded = unplaced.length > 0 || orphanContainers.length > 0
  const infrastructure = ordered(
    resources.filter(
      (r) =>
        !['Node', 'Namespace', 'Pod', 'Container', 'Volume'].includes(r.kind) &&
        (!options || options.objectIds.has(r.id)),
    ),
  )
  const infraShape = dimensions(infrastructure)
  const specifications = nodes.map((node) => {
    const pods = ordered(podsByNode.get(node.name) ?? [])
    return { node, pods, ...dimensions(pods) }
  })
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const rows = Math.max(1, Math.ceil(nodes.length / columns))
  const cellWidth = Math.max(4.8, ...specifications.map((s) => s.width)) + 0.7
  const cellDepth = Math.max(4.8, ...specifications.map((s) => s.depth)) + 0.7
  const width = nodes.length ? columns * cellWidth : 4.8
  const roomDepth = nodes.length ? rows * cellDepth : 0
  const waitingSize = dimensions([...unplaced, ...orphanContainers])
  const workloadDepth = roomDepth + (waitingNeeded ? waitingSize.depth + 0.7 : 0)
  const depth = Math.max(4.8, workloadDepth + (infrastructure.length ? infraShape.depth + 0.7 : 0))
  const positions = new Map<string, Point>()
  function placePod(
    pod: LiveResource,
    index: number,
    origin: Point,
    shape: ReturnType<typeof dimensions>,
  ): PlacedPod {
    const position: Point = [
      origin[0] + ((index % shape.columns) - (shape.columns - 1) / 2) * shape.cell,
      radius(pod) + 0.69,
      origin[2] + (Math.floor(index / shape.columns) - (shape.rows - 1) / 2) * shape.cell + 0.2,
    ]
    const children = podContainers(pod.id)
    const childColumns = Math.max(1, Math.ceil(Math.sqrt(children.length)))
    const childRows = Math.max(1, Math.ceil(children.length / childColumns))
    const placedContainers = children.map((resource, childIndex) => {
      const offset: Point = [
        ((childIndex % childColumns) - (childColumns - 1) / 2) * 0.48,
        0,
        (Math.floor(childIndex / childColumns) - (childRows - 1) / 2) * 0.48,
      ]
      const childPosition: Point = [position[0] + offset[0], position[1], position[2] + offset[2]]
      positions.set(resource.id, childPosition)
      return { resource, position: childPosition, offset }
    })
    positions.set(pod.id, position)
    return { resource: pod, position, radius: radius(pod), containers: placedContainers }
  }
  const rooms = specifications.map((s, index) => {
    const position: Point = [
      ((index % columns) - (columns - 1) / 2) * cellWidth,
      0,
      -depth / 2 + cellDepth / 2 + Math.floor(index / columns) * cellDepth,
    ]
    positions.set(s.node.id, position)
    return {
      resource: s.node,
      position,
      width: s.width,
      depth: s.depth,
      pods: s.pods.map((p, i) => placePod(p, i, position, s)),
    }
  })
  const waitingPosition: Point = [0, 0, -depth / 2 + roomDepth + waitingSize.depth / 2 + 0.35]
  const waitingPods = unplaced.map((p, i) => placePod(p, i, waitingPosition, waitingSize))
  const looseContainers = orphanContainers.map((resource, index) => {
    const position: Point = [
      waitingPosition[0] -
        waitingSize.width / 2 +
        1 +
        ((unplaced.length + index) % waitingSize.columns) * waitingSize.cell,
      1.4,
      waitingPosition[2] -
        waitingSize.depth / 2 +
        1.35 +
        Math.floor((unplaced.length + index) / waitingSize.columns) * waitingSize.cell,
    ]
    positions.set(resource.id, position)
    return { resource, position, offset: [0, 0, 0] as Point }
  })
  for (const ns of resources.filter((r) => r.kind === 'Namespace')) {
    const members = podResources
      .filter((p) => p.namespace === ns.name)
      .map((p) => positions.get(p.id)!)
    positions.set(
      ns.id,
      members.length
        ? members.reduce<Point>(
            (sum, p) => [
              sum[0] + p[0] / members.length,
              sum[1] + p[1] / members.length,
              sum[2] + p[2] / members.length,
            ],
            [0, 0, 0],
          )
        : [0, 0.3, 0],
    )
  }
  const objects = infrastructure.map((resource, index) => {
    const position: Point = [
      ((index % infraShape.columns) - (infraShape.columns - 1) / 2) * infraShape.cell,
      0.65,
      -depth / 2 +
        workloadDepth +
        0.7 +
        (Math.floor(index / infraShape.columns) + 0.5) * infraShape.cell,
    ]
    positions.set(resource.id, position)
    return { resource, position }
  })
  for (const resource of ordered(resources.filter((r) => r.kind === 'Volume'))) {
    if (options && !options.objectIds.has(resource.id)) continue
    const parent = positions.get(resource.parent ?? '')
    if (!parent) continue
    const siblings = resources
      .filter((r) => r.kind === 'Volume' && r.parent === resource.parent)
      .sort((a, b) => a.name.localeCompare(b.name))
    const index = siblings.findIndex((r) => r.id === resource.id)
    const position: Point = [
      parent[0] + (index - (siblings.length - 1) / 2) * 0.38,
      0.36,
      parent[2] + 0.58,
    ]
    positions.set(resource.id, position)
    objects.push({ resource, position })
  }
  const edges: { from: string; to: string; relation: string }[] = []
  for (const r of resources)
    for (const l of r.links ?? []) {
      const target = referenceIndex.get(
        l.uid
          ? JSON.stringify([l.kind, 'uid', l.uid])
          : JSON.stringify([l.kind, 'name', l.namespace ?? '', l.name]),
      )
      if (target) edges.push({ from: r.id, to: target.id, relation: l.relation })
    }
  for (const slice of resources.filter((r) => r.kind === 'EndpointSlice')) {
    const service = edges.find((e) => e.from === slice.id && byId.get(e.to)?.kind === 'Service')
    if (service)
      for (const endpoint of edges.filter(
        (e) => e.from === slice.id && byId.get(e.to)?.kind === 'Pod',
      ))
        edges.push({ from: service.to, to: endpoint.to, relation: endpoint.relation })
  }
  for (const policy of resources.filter((r) => r.kind === 'NetworkPolicy' && r.policy))
    for (const pod of podResources) {
      if (
        pod.namespace === policy.namespace &&
        matches(policy.policy!.podSelector, pod.labels) === true
      )
        edges.push({ from: policy.id, to: pod.id, relation: 'policy selects pod' })
    }
  const layout: HabitatLayout = {
    resources,
    rooms,
    pods: [...rooms.flatMap((r) => r.pods), ...waitingPods],
    looseContainers,
    waiting: waitingNeeded
      ? { position: waitingPosition, width: waitingSize.width, depth: waitingSize.depth }
      : null,
    positions,
    width: Math.max(
      width,
      waitingNeeded ? waitingSize.width : 0,
      infrastructure.length ? infraShape.width : 0,
    ),
    depth,
    objects,
    edges,
  }
  for (const object of objects.filter((o) => o.resource.kind === 'Service')) {
    object.position = servicePatrol(layout, object.resource.id).points[0]
    positions.set(object.resource.id, object.position)
  }
  return layout
}

export function sceneHighlights(
  layout: HabitatLayout,
  selected: string | null,
  matching: string[],
) {
  if (!selected) return new Set(matching)
  const resource = layout.resources.find((r) => r.id === selected)
  const ids = new Set<string>([selected])
  if (!resource) return ids
  if (resource.kind === 'Node')
    for (const member of layout.resources)
      if (member.kind === 'Pod' && member.nodeName === resource.name) ids.add(member.id)
  if (resource.kind === 'Namespace')
    for (const member of layout.resources)
      if (member.namespace === resource.name) ids.add(member.id)
  for (const edge of layout.edges)
    if (edge.from === selected || edge.to === selected) {
      ids.add(edge.from)
      ids.add(edge.to)
    }
  for (const pod of layout.pods) {
    if (
      (resource.kind === 'Node' && pod.resource.nodeName === resource.name) ||
      (resource.kind === 'Namespace' && pod.resource.namespace === resource.name) ||
      pod.resource.id === selected ||
      (resource.kind === 'Container' && resource.parent === pod.resource.id) ||
      (resource.kind === 'Volume' && resource.parent === pod.resource.id)
    ) {
      ids.add(pod.resource.id)
      if (resource.kind !== 'Container')
        for (const child of pod.containers) ids.add(child.resource.id)
      for (const volume of layout.objects.filter(
        (o) => o.resource.kind === 'Volume' && o.resource.parent === pod.resource.id,
      ))
        ids.add(volume.resource.id)
    }
  }
  return ids
}
