import assert from 'node:assert/strict'
import test from 'node:test'
import { lifecycle, lifecycleExplanation, needsInvestigation } from '../src/lifecycle.ts'
import { parseSnapshot } from '../src/useClusterSnapshot.ts'
import { observedChanges, healthSummary } from '../src/scaleModel.ts'

const at = '2026-10-11T12:00:00Z'
const r = (fields = {}) => ({
  id: 'container',
  uid: 'pod-uid',
  kind: 'Container',
  parent: 'pod',
  name: 'app',
  namespace: 'shop',
  resourceVersion: '1',
  observedAt: at,
  state: 'Running',
  ready: true,
  ...fields,
})
const snap = (revision, resources, fields = {}) => ({
  schemaVersion: 1,
  dataSource: 'kubernetes',
  cluster: 'lab',
  sessionId: 'session',
  revision,
  generatedAt: at,
  connection: 'connected',
  resources,
  visibility: ['Node', 'Namespace', 'Pod'].map((kind) => ({
    kind,
    state: 'observing',
    synced: true,
  })),
  ...fields,
})

test('grouped health does not hide a container with unknown termination status', () => {
  const pod = r({ kind: 'Pod', id: 'pod', parent: undefined, state: 'Ready' })
  const container = r({ state: 'Terminated', ready: false })
  assert.equal(needsInvestigation(container, true), true)
  assert.equal(needsInvestigation({ ...container, exitCode: 0 }, true), false)
  assert.equal(needsInvestigation(pod, false), true)
  assert.deepEqual(
    healthSummary([pod], [pod, container], () => true),
    { total: 1, ready: 0, warning: 0, unknown: 1, completed: 0 },
  )
  assert.equal(healthSummary([{ ...pod, deleting: true }], [container], () => true).warning, 1)
})

test('completion, failure, deletion and unavailable termination evidence stay distinct', () => {
  assert.equal(lifecycle(r({ state: 'Terminated', ready: false, exitCode: 0 }), true), 'completed')
  assert.equal(lifecycle(r({ state: 'Terminated', ready: false, exitCode: 137 }), true), 'failed')
  assert.equal(lifecycle(r({ state: 'Terminated', ready: false }), true), 'unknown')
  assert.equal(lifecycle(r({ kind: 'Pod', state: 'Completed', ready: false }), true), 'completed')
  assert.equal(lifecycle(r({ kind: 'Pod', state: 'Failed', deleting: true }), true), 'deleting')
  assert.equal(lifecycle(r({ kind: 'Pod', state: 'Failed' }), false), 'unknown')
  assert.equal(lifecycle(r({ ready: undefined }), true), 'unknown')
  assert.equal(lifecycle(r({ ready: false }), true), 'not-ready')
})
test('past OOM is evidence, not the current running state or a proven root cause', () => {
  const recovered = r({
    lastTermination: { reason: 'OOMKilled', exitCode: 137, finishedAt: at },
    restartCount: 4,
  })
  assert.equal(lifecycle(recovered, true), 'ready')
  assert.equal(
    lifecycle(
      r({
        state: 'Waiting',
        reason: 'CrashLoopBackOff',
        lastTermination: recovered.lastTermination,
      }),
      true,
    ),
    'waiting',
  )
  assert.match(
    lifecycleExplanation(r({ state: 'Waiting', reason: 'CrashLoopBackOff' }), true),
    /underlying cause needs/,
  )
})
test('first connection does not invent a restart; count delta stays within the same pod', () => {
  assert.deepEqual(observedChanges(null, snap(1, [r({ restartCount: 8 })])), [])
  const before = snap(1, [r({ restartCount: 8 })])
  const after = snap(2, [
    r({ restartCount: 10, lastTermination: { exitCode: 137, reason: 'OOMKilled' } }),
  ])
  const changes = observedChanges(before, after)
  assert.equal(changes.length, 1)
  assert.match(changes[0].message, /increased by 2.*same pod UID.*OOMKilled/)
  assert.match(
    observedChanges(after, snap(3, [r({ restartCount: 1 })]))[0].message,
    /discontinuity/,
  )
  assert.deepEqual(observedChanges(after, after), [])
})
test('reconnection, unsynced inventory and new observer sessions cannot fabricate activity', () => {
  const before = snap(1, [r({ restartCount: 0 })])
  const after = snap(2, [r({ restartCount: 5 })])
  assert.deepEqual(observedChanges(before, { ...after, sessionId: 'new' }), [])
  assert.deepEqual(
    observedChanges(before, {
      ...after,
      visibility: [{ kind: 'Pod', state: 'observing', synced: false }],
    }),
    [],
  )
  assert.deepEqual(
    observedChanges(
      { ...before, visibility: [{ kind: 'Pod', state: 'denied', synced: true }] },
      after,
    ),
    [],
  )
})
test('same pod name with a different UID is an appearance, never inferred crash/replacement', () => {
  const pod = r({ kind: 'Pod', id: 'old', uid: 'old', parent: undefined, name: 'web' })
  const changes = observedChanges(snap(1, [pod]), snap(2, [{ ...pod, id: 'new', uid: 'new' }]))
  assert.equal(changes.length, 2)
  assert.match(changes[0].message, /replacement not inferred/)
  assert.match(changes[1].message, /cause not inferred/)
})
test('snapshot accepts narrow termination facts and rejects invalid evidence dates/codes', () => {
  assert.equal(
    parseSnapshot(snap(1, [r({ termination: { exitCode: 0, finishedAt: at } })])).resources[0]
      .termination.exitCode,
    0,
  )
  for (const termination of [
    { exitCode: '137' },
    { exitCode: 0, finishedAt: 'bad-date' },
    { exitCode: 0, reason: 5 },
  ])
    assert.throws(
      () => parseSnapshot(snap(1, [r({ lastTermination: termination })])),
      /Invalid termination evidence/,
    )
})
