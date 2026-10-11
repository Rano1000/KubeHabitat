import test from 'node:test'
import assert from 'node:assert/strict'
import { validInvestigation, validLogs } from '../src/investigation.ts'
const observedAt = '2026-10-11T12:00:00Z'
const eventEvidence = {
  resourceId: 'container',
  scope: 'lab/Pod web',
  targetUid: 'uid',
  observedAt,
  source: 'Kubernetes API',
  target: { state: 'available', reason: 'confirmed' },
  events: {
    state: 'available',
    reason: 'retained',
    limited: false,
    items: [
      {
        uid: 'event',
        type: 'Warning',
        reason: 'BackOff',
        message: 'reported retry',
        count: 2,
        lastObserved: observedAt,
      },
    ],
  },
  logsEnabled: true,
}
const logs = {
  state: 'available',
  reason: 'bounded',
  resourceId: 'container',
  podUid: 'uid',
  observedAt,
  source: 'Kubernetes pods/log',
  previous: true,
  text: 'reported log',
  truncated: false,
  tailLines: 200,
  sinceSeconds: 900,
  byteLimit: 65536,
}
test('investigation validates selected identity and explicit availability', () => {
  assert.equal(validInvestigation(eventEvidence, 'container'), true)
  assert.equal(validInvestigation(eventEvidence, 'different'), false)
  assert.equal(
    validInvestigation(
      { ...eventEvidence, events: { ...eventEvidence.events, state: 'connected' } },
      'container',
    ),
    false,
  )
  assert.equal(
    validInvestigation(
      {
        ...eventEvidence,
        events: {
          ...eventEvidence.events,
          items: [{ ...eventEvidence.events.items[0], lastObserved: 'invalid' }],
        },
      },
      'container',
    ),
    false,
  )
  assert.equal(
    validInvestigation(
      { ...eventEvidence, events: { ...eventEvidence.events, state: 'denied', items: [] } },
      'container',
    ),
    true,
  )
})
test('logs reject wrong identity, run, limits and text accompanying unavailable evidence', () => {
  assert.equal(validLogs(logs, 'container', true), true)
  assert.equal(validLogs(logs, 'container', false), false)
  assert.equal(validLogs(logs, 'other', true), false)
  assert.equal(validLogs({ ...logs, text: 'x'.repeat(65537) }, 'container', true), false)
  assert.equal(validLogs({ ...logs, state: 'replaced' }, 'container', true), false)
  assert.equal(validLogs({ ...logs, state: 'missing', text: undefined }, 'container', true), true)
  assert.equal(validLogs({ ...logs, tailLines: 1000 }, 'container', true), false)
})
