import assert from 'node:assert/strict'
import test from 'node:test'
import {
  workloadGroups,
  healthSummary,
  scalableLayout,
  applicationScope,
  observedChanges,
  REPLICA_PAGE,
} from '../src/scaleModel.ts'
const r = (kind, id, fields = {}) => ({
  kind,
  id,
  uid: id,
  name: id,
  state: 'Ready',
  ready: true,
  resourceVersion: '1',
  observedAt: new Date().toISOString(),
  ...fields,
})
const pod = (id, fields = {}) =>
  r('Pod', id, {
    namespace: 'shop',
    nodeName: 'worker',
    owner: { uid: 'rs-1', name: 'web-1', kind: 'ReplicaSet' },
    ...fields,
  })

test('controller groups preserve node, namespace and owner UID boundaries', () => {
  const pods = [
    pod('a'),
    pod('b'),
    pod('c', { nodeName: 'other' }),
    pod('d', { namespace: 'other' }),
    pod('e', { owner: { uid: 'replacement', name: 'web-1', kind: 'ReplicaSet' } }),
  ]
  const groups = workloadGroups(pods)
  assert.equal(groups.length, 4)
  assert.deepEqual(groups.map((g) => g.pods.length).sort(), [1, 1, 1, 2])
  assert.equal(workloadGroups([pod('f')])[0].id, workloadGroups([pod('replacement-pod')])[0].id)
  assert.deepEqual(workloadGroups([...pods].reverse()), groups)
})
test('names never invent replica ownership; application label grouping is explicit', () => {
  const pods = [
    pod('web-a', { owner: undefined }),
    pod('web-b', { owner: undefined }),
    pod('label-a', { owner: undefined, labels: { app: 'web' } }),
    pod('label-b', { owner: undefined, labels: { app: 'web' } }),
  ]
  const groups = workloadGroups(pods)
  assert.equal(groups.length, 3)
  assert.equal(groups.find((g) => g.basis === 'label').pods.length, 2)
  assert.equal(groups.filter((g) => g.basis === 'standalone').length, 2)
})
test('warnings inside a container survive aggregation; stale health becomes unknown and completion is not failure', () => {
  const pods = [
    pod('ready'),
    pod('failed-container'),
    pod('completed', { state: 'Completed', ready: false }),
    pod('unknown', { state: 'Unknown', ready: undefined }),
  ]
  const resources = [
    ...pods,
    r('Container', 'broken', {
      parent: 'failed-container',
      state: 'Waiting',
      reason: 'CrashLoopBackOff',
    }),
  ]
  assert.deepEqual(
    healthSummary(pods, resources, () => true),
    { total: 4, ready: 1, warning: 1, unknown: 1, completed: 1 },
  )
  assert.deepEqual(
    healthSummary(pods, resources, () => false),
    { total: 4, ready: 0, warning: 0, unknown: 4, completed: 0 },
  )
})
test('grouped layout keeps exact totals, all pod identities and a bounded replica page', () => {
  const pods = Array.from({ length: 1000 }, (_, i) => pod(`pod-${String(i).padStart(4, '0')}`))
  const resources = [
    r('Node', 'node', { name: 'worker' }),
    ...pods,
    ...pods.map((p) => r('Container', `${p.id}/app`, { parent: p.id })),
  ]
  const group = workloadGroups(resources)[0]
  const closed = scalableLayout(resources, new Set(), true, null, 0, null)
  assert.equal(closed.totalPods, 1000)
  assert.equal(closed.totalContainers, 1000)
  assert.equal(closed.pods.length, 0)
  assert.equal(closed.groups[0].hidden, 1000)
  for (const resource of resources) assert.ok(closed.positions.has(resource.id), resource.id)
  const opened = scalableLayout(resources, new Set(), true, group.id, 1, null)
  assert.equal(opened.pods.length, REPLICA_PAGE)
  assert.equal(opened.groups[0].hidden, 952)
  assert.equal(opened.pods[0].resource.id, pods[48].id)
  const selected = scalableLayout(resources, new Set(), true, null, 0, pods[999].id)
  assert.equal(selected.pods.length, 1)
  assert.equal(selected.pods[0].resource.id, pods[999].id)
  assert.equal(selected.pods[0].containers.length, 1)
  const stable = scalableLayout([...resources].reverse(), new Set(), true, null, 0, null)
  assert.deepEqual(
    closed.groups.map((g) => g.position),
    stable.groups.map((g) => g.position),
  )
})
test('collapsed geometry retains actual endpoint UID routing and pod node membership', () => {
  const p = pod('actual'),
    s = r('Service', 's', { name: 'web', namespace: 'shop' })
  const slice = r('EndpointSlice', 'slice', {
    namespace: 'shop',
    links: [
      { kind: 'Service', name: 'web', namespace: 'shop', relation: 'service' },
      { kind: 'Pod', uid: p.uid, relation: 'endpoint' },
    ],
  })
  const resources = [r('Node', 'node', { name: 'worker' }), p, s, slice]
  const layout = scalableLayout(resources, new Set([s.id]), true, null, 0, null)
  assert.ok(layout.edges.some((e) => e.from === s.id && e.to === p.id))
  assert.equal(layout.resources.find((x) => x.id === p.id).nodeName, 'worker')
  const replacement = { ...p, uid: 'new', id: 'new' }
  assert.ok(
    !scalableLayout(
      [resources[0], replacement, s, slice],
      new Set([s.id]),
      true,
      null,
      0,
      null,
    ).edges.some((e) => e.from === s.id && e.to === replacement.id),
  )
})
test('application scope includes serving Services and pod storage, excludes unrelated endpoint pods', () => {
  const p = pod('shop', { labels: { app: 'checkout' } }),
    other = pod('other', { labels: { app: 'other' } })
  const service = r('Service', 'web', { namespace: 'shop' })
  const slice = r('EndpointSlice', 'slice', {
    links: [
      { kind: 'Pod', uid: p.uid, relation: 'endpoint' },
      { kind: 'Pod', uid: other.uid, relation: 'endpoint' },
      { kind: 'Service', uid: service.uid, relation: 'service' },
    ],
  })
  const c = r('Container', 'c', { parent: p.id }),
    v = r('Volume', 'v', {
      parent: p.id,
      links: [{ kind: 'PersistentVolumeClaim', uid: 'claim', relation: 'claim' }],
    }),
    claim = r('PersistentVolumeClaim', 'claim')
  assert.deepEqual(
    applicationScope([p, other, service, slice, c, v, claim], 'shop/checkout')
      .map((r) => r.id)
      .sort(),
    ['shop', 'web', 'slice', 'c', 'v', 'claim'].sort(),
  )
})
test('browser activity never infers crashes or replacements, and suppresses reconnect gaps', () => {
  const snap = (revision, resources, sessionId = 'same', state = 'observing') => ({
    revision,
    resources,
    sessionId,
    generatedAt: '2026-10-11T01:00:00Z',
    visibility: [{ kind: 'Pod', state, synced: true }],
  })
  assert.deepEqual(observedChanges(null, snap(1, [pod('a')])), [])
  assert.match(observedChanges(snap(1, [pod('a')]), snap(2, []))[0].message, /cause not inferred/)
  assert.deepEqual(observedChanges(snap(1, [pod('a')]), snap(2, [], 'restarted')), [])
  assert.deepEqual(observedChanges(snap(1, [pod('a')], 'same', 'denied'), snap(2, [])), [])
  assert.match(
    observedChanges(snap(1, [pod('a')]), snap(2, [pod('a', { state: 'NotReady' })]))[0].message,
    /Ready → NotReady/,
  )
})
