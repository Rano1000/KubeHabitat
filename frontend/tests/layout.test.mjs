import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHabitatLayout, sceneHighlights } from '../src/habitatLayout.ts'
import { podStorage, sceneObjectIds, storageFacts } from '../src/habitatView.ts'
import { servicePatrol } from '../src/serviceGuide.ts'

function resource(kind, id, fields = {}) {
  return {
    kind,
    id,
    uid: id,
    name: id,
    resourceVersion: '1',
    observedAt: '2026-10-10T19:50:00Z',
    state: 'Ready',
    ready: true,
    ...fields,
  }
}
const node = (name) => resource('Node', `Node:${name}`, { name })
const pod = (name, nodeName, namespace = 'shop') =>
  resource('Pod', `Pod:${name}`, { name, nodeName, namespace })
const container = (parent, name = 'app') =>
  resource('Container', `${parent}/app/${name}`, { name, parent, namespace: 'shop' })

test('a Service guide follows endpoint pods across nodes without patrolling unrelated nodes', () => {
  const a = pod('first', 'a'),
    b = pod('second', 'b'),
    unrelated = pod('unrelated', 'c')
  const service = resource('Service', 'service', { name: 'checkout', namespace: 'shop' })
  const slice = resource('EndpointSlice', 'slice', {
    namespace: 'shop',
    links: [
      { kind: 'Service', name: service.name, namespace: 'shop', relation: 'service' },
      { kind: 'Pod', uid: a.uid, relation: 'endpoint' },
      { kind: 'Pod', uid: b.uid, relation: 'endpoint' },
    ],
  })
  const layout = buildHabitatLayout([
    node('a'),
    node('b'),
    node('c'),
    a,
    b,
    unrelated,
    service,
    slice,
  ])
  const route = servicePatrol(layout, service.id)
  assert.deepEqual(route.roomIds, ['Node:a', 'Node:b'])
  for (const room of layout.rooms.filter((r) => route.roomIds.includes(r.resource.id))) {
    assert.ok(
      route.points.some(
        (p) =>
          Math.abs(p[0] - room.position[0]) < room.width / 2 &&
          Math.abs(p[2] - room.position[2]) < room.depth / 2,
      ),
    )
  }
  assert.deepEqual(layout.positions.get(service.id), route.points[0])
})

test('a Service with external endpoints or replaced pod UIDs never invents a node patrol', () => {
  const replacement = pod('same-name', 'a')
  const service = resource('Service', 'service', { name: 'checkout', namespace: 'shop' })
  const slice = resource('EndpointSlice', 'slice', {
    namespace: 'shop',
    links: [
      { kind: 'Service', name: service.name, namespace: 'shop', relation: 'service' },
      {
        kind: 'Pod',
        name: replacement.name,
        uid: 'old-uid',
        namespace: 'shop',
        relation: 'endpoint',
      },
    ],
  })
  const route = servicePatrol(
    buildHabitatLayout([node('a'), replacement, service, slice]),
    service.id,
  )
  assert.deepEqual(route.roomIds, [])
  assert.equal(route.points.length, 1)
})

test('empty observations generate no demo nodes, pods or containers', () => {
  const layout = buildHabitatLayout([])
  assert.equal(layout.rooms.length, 0)
  assert.equal(layout.pods.length, 0)
  assert.equal(layout.looseContainers.length, 0)
  assert.equal(layout.waiting, null)
})

test('network and storage objects are placed with observed reference chains', () => {
  const p = pod('web', 'a'),
    c = container(p.id)
  const volume = resource('Volume', `${p.id}/volume/data`, {
    parent: p.id,
    namespace: 'shop',
    links: [{ kind: 'PersistentVolumeClaim', name: 'data', namespace: 'shop', relation: 'claim' }],
  })
  c.links = [{ kind: 'Volume', uid: volume.id, relation: 'mount' }]
  const claim = resource('PersistentVolumeClaim', 'claim', {
    name: 'data',
    namespace: 'shop',
    links: [{ kind: 'PersistentVolume', name: 'disk', relation: 'bound volume' }],
  })
  const disk = resource('PersistentVolume', 'disk', { name: 'disk' })
  const service = resource('Service', 'service', { name: 'web', namespace: 'shop' })
  const slice = resource('EndpointSlice', 'slice', {
    namespace: 'shop',
    links: [
      { kind: 'Service', name: 'web', namespace: 'shop', relation: 'endpoints' },
      { kind: 'Pod', uid: p.uid, name: p.name, namespace: 'shop', relation: 'ready endpoint' },
    ],
  })
  const model = buildHabitatLayout([node('a'), p, c, volume, claim, disk, service, slice])
  for (const r of model.resources)
    assert.ok(model.positions.has(r.id), `missing placement: ${r.kind}`)
  assert.ok(model.edges.some((e) => e.from === service.id && e.to === p.id))
  assert.ok(model.edges.some((e) => e.from === c.id && e.to === volume.id))
  assert.ok(model.edges.some((e) => e.from === claim.id && e.to === disk.id))
})

test('stale endpoint UIDs never link a replacement pod with the same name', () => {
  const p = pod('web', 'a')
  const slice = resource('EndpointSlice', 'slice', {
    namespace: 'shop',
    links: [{ kind: 'Pod', uid: 'old-uid', name: p.name, namespace: 'shop', relation: 'endpoint' }],
  })
  assert.equal(buildHabitatLayout([node('a'), p, slice]).edges.length, 0)
})

test('each observed pod is placed once on its actual node, including all container types', () => {
  const resources = [
    node('a'),
    node('b'),
    pod('web', 'b'),
    container('Pod:web', 'app'),
    container('Pod:web', 'init'),
    container('Pod:web', 'debug'),
  ]
  const layout = buildHabitatLayout(resources)
  assert.deepEqual(
    layout.rooms.map((r) => [r.resource.name, r.pods.length]),
    [
      ['a', 0],
      ['b', 1],
    ],
  )
  assert.equal(layout.pods.length, 1)
  assert.equal(layout.pods[0].containers.length, 3)
  assert.equal(new Set(layout.pods[0].containers.map((c) => c.position.join(':'))).size, 3)
  for (const r of resources) assert.ok(layout.positions.has(r.id))
})

test('unobserved nodes and unscheduled pods use a waiting area without manufacturing a node', () => {
  const layout = buildHabitatLayout([pod('pending', undefined), pod('denied-node', 'hidden-node')])
  assert.equal(layout.rooms.length, 0)
  assert.equal(layout.pods.length, 2)
  assert.ok(layout.waiting)
  assert.equal(layout.resources.filter((r) => r.kind === 'Node').length, 0)
})

test('house and room dimensions grow and shrink with actual workload counts', () => {
  const base = buildHabitatLayout([node('a'), pod('one', 'a')])
  const many = buildHabitatLayout([
    node('a'),
    ...Array.from({ length: 30 }, (_, i) => pod(`pod-${i}`, 'a')),
  ])
  assert.ok(many.width > base.width)
  assert.ok(many.depth > base.depth)
  assert.ok(many.rooms[0].width > base.rooms[0].width)
  const shrunk = buildHabitatLayout([node('a'), pod('one', 'a')])
  assert.equal(shrunk.width, base.width)
  assert.equal(shrunk.depth, base.depth)
  assert.equal(shrunk.pods.length, 1)
})

test('namespaces span nodes; selection highlights their actual members', () => {
  const ns = resource('Namespace', 'Namespace:shop', { name: 'shop', state: 'Active' })
  const layout = buildHabitatLayout([
    node('a'),
    node('b'),
    ns,
    pod('first', 'a'),
    pod('second', 'b'),
    pod('other', 'b', 'system'),
    container('Pod:first'),
  ])
  const ids = sceneHighlights(layout, ns.id, [])
  assert.ok(ids.has('Pod:first'))
  assert.ok(ids.has('Pod:second'))
  assert.ok(ids.has('Pod:first/app/app'))
  assert.ok(!ids.has('Pod:other'))
  assert.equal(layout.rooms.length, 2)
})

test('layout is stable when snapshots reorder objects, and identity replacement removes the old pod', () => {
  const resources = [node('a'), node('b'), pod('first', 'a'), pod('second', 'b')]
  const forward = buildHabitatLayout(resources)
  const reversed = buildHabitatLayout([...resources].reverse())
  assert.deepEqual([...forward.positions], [...reversed.positions])
  const replacement = buildHabitatLayout([
    node('a'),
    node('b'),
    pod('replacement', 'a'),
    pod('second', 'b'),
  ])
  assert.ok(!replacement.positions.has('Pod:first'))
  assert.ok(replacement.positions.has('Pod:replacement'))
})

test('an orphan container remains inspectable without inventing its parent pod', () => {
  const layout = buildHabitatLayout([container('Pod:not-observed')])
  assert.equal(layout.pods.length, 0)
  assert.equal(layout.looseContainers.length, 1)
  assert.ok(layout.waiting)
})

test('overview hides storage and networking internals without losing service-to-pod routing', () => {
  const p = pod('api', 'a')
  const service = resource('Service', 'gateway', { name: 'api', namespace: 'shop' })
  const slice = resource('EndpointSlice', 'routes', {
    namespace: 'shop',
    links: [
      { kind: 'Service', name: 'api', namespace: 'shop', relation: 'service endpoints' },
      { kind: 'Pod', uid: p.uid, name: p.name, namespace: 'shop', relation: 'ready endpoint' },
    ],
  })
  const extra = Array.from({ length: 40 }, (_, i) => resource('PersistentVolume', `disk-${i}`))
  const resources = [node('a'), p, container(p.id), service, slice, ...extra]
  const objectIds = sceneObjectIds(
    resources,
    { network: false, storage: false, capacity: false },
    null,
  )
  const layout = buildHabitatLayout(resources, { objectIds })
  const baseline = buildHabitatLayout([node('a'), p, container(p.id), service])
  assert.deepEqual(
    layout.objects.map((o) => o.resource.id),
    [service.id],
  )
  assert.equal(layout.width, baseline.width)
  assert.equal(layout.depth, baseline.depth)
  assert.equal(layout.pods[0].containers.length, 1)
  assert.ok(layout.edges.some((e) => e.from === service.id && e.to === p.id))
})

test('storage selection follows only the chosen pod attachments and their exact claim chain', () => {
  const a = pod('a', 'n'),
    b = pod('b', 'n')
  const first = resource('Volume', 'a/data', {
    name: 'data',
    parent: a.id,
    namespace: 'shop',
    links: [
      { kind: 'PersistentVolumeClaim', name: 'shared', namespace: 'shop', relation: 'claim' },
    ],
  })
  const second = resource('Volume', 'b/data', {
    name: 'data',
    parent: b.id,
    namespace: 'shop',
    links: [{ kind: 'PersistentVolumeClaim', name: 'other', namespace: 'shop', relation: 'claim' }],
  })
  const claim = resource('PersistentVolumeClaim', 'wanted', {
    name: 'shared',
    namespace: 'shop',
    links: [{ kind: 'PersistentVolume', name: 'disk', uid: 'disk-uid', relation: 'bound volume' }],
  })
  const sameName = resource('PersistentVolumeClaim', 'wrong-namespace', {
    name: 'shared',
    namespace: 'other',
  })
  const disk = resource('PersistentVolume', 'disk-uid', { name: 'disk' })
  const resources = [a, b, first, second, claim, sameName, disk]
  assert.deepEqual([...podStorage(resources, a.id)].sort(), ['a/data', 'disk-uid', 'wanted'])
  const ids = sceneObjectIds(resources, { network: false, storage: true, capacity: false }, a.id)
  assert.ok(!ids.has(second.id))
  assert.ok(!ids.has(sameName.id))
  const replacedDisk = resource('PersistentVolume', 'new-disk', { name: 'disk' })
  assert.ok(
    !podStorage([...resources.filter((r) => r.id !== disk.id), replacedDisk], a.id).has(
      replacedDisk.id,
    ),
  )
})

test('storage labels distinguish PVC requests and capacity from explicit volume limits', () => {
  const claim = resource('PersistentVolumeClaim', 'claim', {
    name: 'data',
    namespace: 'shop',
    details: { 'requested storage': '64Mi', 'capacity storage': '128Mi' },
  })
  const volume = resource('Volume', 'pod/data', {
    parent: 'pod',
    name: 'data',
    namespace: 'shop',
    links: [{ kind: 'PersistentVolumeClaim', name: 'data', namespace: 'shop', relation: 'claim' }],
  })
  const facts = storageFacts([claim, volume], volume)
  assert.equal(facts.minimum, '64Mi')
  assert.equal(facts.capacity, '128Mi')
  assert.equal(facts.maximum, 'Not declared')
  assert.equal(storageFacts([volume], volume).minimum, 'Not observed')
  const memory = resource('Volume', 'pod/cache', {
    name: 'cache',
    details: { type: 'emptyDir', medium: 'Memory', 'size limit': '16Mi' },
  })
  assert.equal(storageFacts([memory], memory).maximum, '16Mi')
  assert.equal(storageFacts([memory], memory).minimum, 'Not declared')
  assert.equal(storageFacts([memory], memory).capacity, 'Not observed')
})

test('namespace selection highlights its services and workloads across nodes, excluding other namespaces', () => {
  const ns = resource('Namespace', 'ns', { name: 'shop' })
  const service = resource('Service', 'shop-service', { namespace: 'shop' })
  const other = resource('Service', 'other-service', { namespace: 'other' })
  const layout = buildHabitatLayout([
    node('a'),
    node('b'),
    ns,
    pod('first', 'a'),
    pod('second', 'b'),
    service,
    other,
  ])
  const ids = sceneHighlights(layout, ns.id, [])
  assert.ok(ids.has(service.id))
  assert.ok(ids.has('Pod:first') && ids.has('Pod:second'))
  assert.ok(!ids.has(other.id))
})
