import type { HabitatLayout, Point } from './habitatLayout'

// One visual guide per Service; only observed endpoint pod identities determine its rooms.
export function servicePatrol(layout: HabitatLayout, serviceId: string) {
  const destinations = new Set(layout.edges.filter((e) => e.from === serviceId).map((e) => e.to))
  const rooms = layout.rooms.filter((room) =>
    room.pods.some((pod) => destinations.has(pod.resource.id)),
  )
  const services = layout.resources
    .filter((r) => r.kind === 'Service')
    .map((r) => r.id)
    .sort()
  const lane = 0.38 + (Math.max(0, services.indexOf(serviceId)) % 3) * 0.16
  const points: Point[] = rooms.flatMap((room) => {
    const x = room.position[0],
      z = room.position[2]
    const halfWidth = Math.max(0.5, room.width / 2 - lane)
    const halfDepth = Math.max(0.5, room.depth / 2 - lane)
    return [
      [x - halfWidth, 0.12, z + halfDepth],
      [x + halfWidth, 0.12, z + halfDepth],
      [x + halfWidth, 0.12, z - halfDepth],
      [x - halfWidth, 0.12, z - halfDepth],
      [x - halfWidth, 0.12, z + halfDepth],
    ] as Point[]
  })
  if (!points.length) {
    const anchor = layout.positions.get(serviceId) ?? [0, 0, 0]
    points.push([anchor[0], 0.12, anchor[2]])
  }
  return { points, roomIds: rooms.map((room) => room.resource.id) }
}

// Distance rather than frame count keeps walking speed consistent and supports pause/resume.
export function patrolPose(points: Point[], distance: number) {
  const segments = points.map((from, index) => {
    const to = points[(index + 1) % points.length]
    return { from, to, length: Math.hypot(to[0] - from[0], to[2] - from[2]) }
  })
  const total = segments.reduce((sum, segment) => sum + segment.length, 0)
  let remaining = total ? ((distance % total) + total) % total : 0
  for (const { from, to, length } of segments) {
    if (!length) continue
    if (remaining <= length) {
      const ratio = remaining / length
      return {
        position: [
          from[0] + (to[0] - from[0]) * ratio,
          from[1],
          from[2] + (to[2] - from[2]) * ratio,
        ] as Point,
        yaw: Math.atan2(to[0] - from[0], to[2] - from[2]),
      }
    }
    remaining -= length
  }
  return { position: points[0] ?? ([0, 0.12, 0] as Point), yaw: 0 }
}
