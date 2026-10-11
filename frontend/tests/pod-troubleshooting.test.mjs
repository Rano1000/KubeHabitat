import test from 'node:test'
import assert from 'node:assert/strict'
import { podCommands, podGuidance, podNeedsInspection } from '../src/podTroubleshooting.ts'

const pod = {
  id: 'Pod:uid',
  kind: 'Pod',
  name: 'shop-worker',
  namespace: 'shop',
  state: 'Ready',
  ready: true,
}
const child = {
  id: 'Container:uid/app',
  kind: 'Container',
  parent: pod.id,
  namespace: 'shop',
  name: 'app',
  state: 'Running',
  ready: true,
}

test('commands are scoped, read-only, explicit about context and container identity', () => {
  const commands = podCommands(
    pod,
    [
      { ...child, restartCount: 2 },
      { ...child, name: 'wrong', parent: 'other' },
      { ...child, name: 'foreign', namespace: 'other' },
    ],
    'troubleshoot',
  )
  assert.equal(commands.length, 3)
  for (const { text } of commands) {
    assert.match(text, /--context '<YOUR_CONTEXT>' --namespace 'shop'/)
    assert.doesNotMatch(text, /\b(delete|apply|patch|exec|debug|rollout|run|wrong|foreign)\b/)
  }
  assert.match(commands[1].text, /logs 'shop-worker' --container 'app'/)
  assert.match(commands[2].text, /--previous$/)
  assert.equal(podCommands(pod, [child], 'troubleshoot').length, 2)
})

test('untrusted names cannot become shell commands in Bash or PowerShell', () => {
  for (const value of [
    "x'; curl evil; '",
    '$(whoami)',
    '`whoami`',
    'a\nb',
    '-all',
    'x'.repeat(254),
  ]) {
    assert.deepEqual(podCommands({ ...pod, name: value }, [child], 'troubleshoot'), [])
    assert.deepEqual(podCommands({ ...pod, namespace: value }, [child], 'troubleshoot'), [])
    assert.equal(podCommands(pod, [{ ...child, name: value }], 'troubleshoot').length, 1)
  }
})

test('container-only issues are surfaced without treating recovered history or completion as an alarm', () => {
  const fresh = () => true
  assert.equal(podNeedsInspection(pod, [child], fresh), false)
  assert.equal(
    podNeedsInspection(
      pod,
      [{ ...child, state: 'Waiting', ready: false, reason: 'CrashLoopBackOff' }],
      fresh,
    ),
    true,
  )
  assert.equal(
    podNeedsInspection(
      pod,
      [{ ...child, lastTermination: { reason: 'OOMKilled', exitCode: 137 } }],
      fresh,
    ),
    false,
  )
  assert.equal(
    podNeedsInspection(
      { ...pod, state: 'Completed' },
      [{ ...child, state: 'Terminated', ready: false, exitCode: 0 }],
      fresh,
    ),
    false,
  )
  assert.equal(
    podNeedsInspection(pod, [child], () => false),
    true,
  )
})

test('guidance distinguishes status, stale observations and possible causes', () => {
  const crash = podGuidance(
    { ...child, state: 'Waiting', ready: false, reason: 'CrashLoopBackOff' },
    true,
  )
  assert.match(crash.observation, /underlying cause needs/)
  assert.match(crash.check, /previous logs/)
  assert.match(
    podGuidance({ ...child, reason: 'OOMKilled' }, true).check,
    /does not establish a memory leak/,
  )
  assert.match(podGuidance(child, false).observation, /Current health is unknown/)
  assert.match(podGuidance(child, false).check, /Restore observation freshness/)
})
