import assert from 'node:assert/strict'
import test from 'node:test'
import { ownerChain, appendMetricPoint, metricSegments } from '../src/workloadEvidenceModel.ts'
import { applicationScope } from '../src/scaleModel.ts'

const resource = (kind, uid, fields = {}) => ({
  id: `${kind}:${uid}`,
  uid,
  kind,
  name: uid,
  namespace: 'shop',
  ...fields,
})
test('ownership follows UID chains, stops at missing identities, and stays in its namespace', () => {
  const deployment = resource('Deployment', 'd'),
    set = resource('ReplicaSet', 'rs', { owner: { kind: 'Deployment', uid: 'd', name: 'web' } }),
    pod = resource('Pod', 'p', { owner: { kind: 'ReplicaSet', uid: 'rs', name: 'web-rs' } }),
    container = resource('Container', 'c', { parent: pod.id })
  assert.deepEqual(
    ownerChain(container, [container, pod, set, deployment]).map((s) => s.resource?.id),
    [pod.id, set.id, deployment.id],
  )
  assert.equal(ownerChain(pod, [pod, { ...set, uid: 'replacement' }])[0].resource, undefined)
  assert.equal(ownerChain(pod, [pod, { ...set, namespace: 'other' }])[0].resource, undefined)
  set.owner = { kind: 'Pod', uid: 'p', name: 'p' }
  assert.equal(ownerChain(pod, [pod, set]).length, 1)
})
test('application scope keeps unlabelled controlling owners without unrelated workloads', () => {
  const deployment = resource('Deployment', 'd'),
    set = resource('ReplicaSet', 'rs', { owner: { kind: 'Deployment', uid: 'd', name: 'web' } }),
    pod = resource('Pod', 'p', {
      labels: { app: 'web' },
      owner: { kind: 'ReplicaSet', uid: 'rs', name: 'web-rs' },
    }),
    unrelated = resource('Deployment', 'other')
  assert.deepEqual(
    applicationScope([deployment, set, pod, unrelated], 'shop/web').map((r) => r.id),
    [deployment.id, set.id, pod.id],
  )
})
test('metrics preserve measured zero, deduplicate timestamps and break lines across gaps', () => {
  const at = Date.now(),
    usage = (offset, cpu = 0) => ({
      cpuMilli: cpu,
      memoryBytes: 0,
      timestamp: new Date(at + offset).toISOString(),
      window: '15s',
    })
  let points = appendMetricPoint([], usage(0), at)
  assert.equal(points[0].cpu, 0)
  points = appendMetricPoint(points, usage(0), at + 2000)
  assert.equal(points.length, 1)
  points = appendMetricPoint(points, undefined, at + 3000)
  points = appendMetricPoint(points, usage(15000, 10), at + 15000)
  assert.equal(metricSegments(points).length, 2)
  points = appendMetricPoint(points, usage(75000, 20), at + 75000)
  assert.equal(metricSegments(points).length, 3)
  assert.equal(appendMetricPoint([], usage(-120000), at).length, 0)
  assert.equal(appendMetricPoint([], usage(6000), at).length, 0)
})
test('inspector history is bounded in size and time', () => {
  const at = Date.now()
  let points = []
  for (let i = 0; i < 200; i++)
    points = appendMetricPoint(
      points,
      {
        cpuMilli: 1,
        memoryBytes: 1048576,
        timestamp: new Date(at + i * 10000).toISOString(),
        window: '10s',
      },
      at + i * 10000,
    )
  assert(points.length <= 40)
  assert(points.every((p) => at + 1990000 - p.at <= 300000))
})
