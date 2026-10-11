import test from 'node:test'
import assert from 'node:assert/strict'
import { componentAppearance } from '../src/componentAppearance.ts'
import { lifecycle } from '../src/lifecycle.ts'

const pod = {
  id: 'pod',
  kind: 'Pod',
  nodeName: 'worker',
  phase: 'Running',
  state: 'NotReady',
  ready: false,
  conditions: [{ type: 'Ready', status: 'False', reason: 'ContainersNotReady' }],
}
const container = {
  id: 'app',
  kind: 'Container',
  parent: 'pod',
  containerType: 'app',
  state: 'Waiting',
  ready: false,
  reason: 'CrashLoopBackOff',
}
const fresh = () => true

test('container crash loop alerts only the affected box, preserving actual Pod Ready=false', () => {
  assert.equal(componentAppearance(pod, [container], fresh).tone, 'normal')
  assert.equal(componentAppearance(pod, [container], fresh).containerImpact, true)
  assert.equal(lifecycle(pod, true), 'not-ready')
  assert.equal(componentAppearance(container, [], fresh).tone, 'danger')
  const sibling = { ...container, id: 'sidecar', state: 'Running', ready: true, reason: undefined }
  assert.equal(componentAppearance(sibling, [], fresh).tone, 'normal')
})
test('waiting is yellow, failed exit red, and previous failed exits do not poison current health', () => {
  assert.equal(
    componentAppearance({ ...container, reason: 'ImagePullBackOff' }, [], fresh).tone,
    'warning',
  )
  assert.equal(
    componentAppearance({ ...container, state: 'Terminated', exitCode: 137 }, [], fresh).tone,
    'danger',
  )
  assert.equal(
    componentAppearance(
      {
        ...container,
        state: 'Running',
        ready: true,
        reason: undefined,
        lastTermination: { exitCode: 137, reason: 'OOMKilled' },
      },
      [],
      fresh,
    ).tone,
    'normal',
  )
})
test('pod failure and independent pod blockers do not recolour healthy containers', () => {
  const healthy = { ...container, state: 'Running', ready: true, reason: undefined }
  assert.equal(
    componentAppearance({ ...pod, state: 'Failed', reason: 'Evicted' }, [healthy], fresh).tone,
    'danger',
  )
  assert.equal(componentAppearance(healthy, [], fresh).tone, 'normal')
  for (const condition of [
    { type: 'PodScheduled', status: 'False', reason: 'Unschedulable' },
    { type: 'PodReadyToStartContainers', status: 'False' },
    { type: 'Ready', status: 'False', reason: 'ReadinessGatesNotReady' },
  ]) {
    const ownIssue = { ...pod, conditions: [...pod.conditions, condition] }
    assert.equal(componentAppearance(ownIssue, [container], fresh).tone, 'warning')
    assert.equal(componentAppearance(ownIssue, [container], fresh).containerImpact, false)
  }
})
test('unknown, unrelated and absent container evidence cannot clear a pod warning', () => {
  assert.equal(componentAppearance(pod, [], fresh).tone, 'warning')
  assert.equal(
    componentAppearance(pod, [{ ...container, parent: 'other-pod' }], fresh).tone,
    'warning',
  )
  assert.equal(componentAppearance(pod, [container], (r) => r.kind === 'Pod').tone, 'warning')
  assert.equal(componentAppearance(pod, [container], () => false).tone, 'unknown')
  assert.equal(componentAppearance({ ...pod, conditions: [] }, [container], fresh).tone, 'warning')
  assert.equal(
    componentAppearance({ ...pod, reason: 'NodeLost' }, [container], fresh).tone,
    'warning',
  )
})
test('init container faults can leave the shell normal, but deletion and completion keep their own signals', () => {
  const init = { ...container, containerType: 'init' }
  const initializing = {
    ...pod,
    state: 'Pending',
    phase: 'Pending',
    conditions: [
      ...pod.conditions,
      { type: 'Initialized', status: 'False', reason: 'ContainersNotInitialized' },
    ],
  }
  assert.equal(componentAppearance(initializing, [init], fresh).containerImpact, true)
  assert.equal(componentAppearance({ ...pod, deleting: true }, [container], fresh).tone, 'warning')
  assert.equal(
    componentAppearance({ ...pod, state: 'Completed' }, [container], fresh).tone,
    'complete',
  )
})
