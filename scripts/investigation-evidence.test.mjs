import assert from 'node:assert/strict'
import test from 'node:test'
import { previousFailureVerified } from './investigation-evidence.mjs'

const prior = {
  mode: 'faults',
  podUid: 'selected',
  assertions: Array.from({ length: 10 }, (_, i) => ({
    name: i === 0 ? 'previous failed run logs available' : `check ${i}`,
    passed: true,
  })),
}
const missing = { state: 'unavailable', podUid: 'selected' }

test('retained failure logs must match the selected pod identity', () => {
  const logs = {
    state: 'available',
    podUid: 'selected',
    text: 'Deliberate acceptance failure: exit 42',
  }
  assert.equal(previousFailureVerified(logs, 'selected', false), true)
  assert.equal(previousFailureVerified(logs, 'replacement', true, prior), false)
  assert.equal(
    previousFailureVerified({ ...logs, text: 'unable to retrieve' }, 'selected', true, prior),
    false,
  )
})
test('unavailable recovery logs require a fully passing fault report for the same UID', () => {
  assert.equal(previousFailureVerified(missing, 'selected', true, prior), true)
  for (const report of [
    undefined,
    { ...prior, podUid: 'old' },
    { ...prior, mode: 'recovered' },
    { ...prior, assertions: [{ name: 'previous failed run logs available', passed: true }] },
    {
      ...prior,
      assertions: prior.assertions.map((a, i) => (i === 1 ? { ...a, passed: false } : a)),
    },
  ])
    assert.equal(previousFailureVerified(missing, 'selected', true, report), false)
})
test('fault mode, denied reads and unexpected bodies never pass as retained evidence', () => {
  assert.equal(previousFailureVerified(missing, 'selected', false, prior), false)
  assert.equal(
    previousFailureVerified({ ...missing, state: 'denied' }, 'selected', true, prior),
    false,
  )
  assert.equal(
    previousFailureVerified({ ...missing, text: 'runtime error' }, 'selected', true, prior),
    false,
  )
})
