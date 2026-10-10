import assert from 'node:assert/strict'
import test from 'node:test'
import { policyCheck, matches } from '../src/networkPolicy.ts'
const pod = (name, namespace = 'shop', labels = {}) => ({
  kind: 'Pod',
  id: `Pod:${name}`,
  name,
  namespace,
  labels,
})
const source = pod('client', 'shop', { role: 'client' }),
  target = pod('db', 'shop', { role: 'db' })
const policy = (name, fields = {}) => ({
  kind: 'NetworkPolicy',
  id: name,
  name,
  namespace: 'shop',
  policy: { podSelector: { matchLabels: { role: 'db' } }, policyTypes: ['Ingress'], ...fields },
})
const check = (policies, port = 80, complete = true, extras = []) =>
  policyCheck([source, target, ...policies, ...extras], source, target, port, 'TCP', complete)
    .verdict
test('absence of policies permits by declaration, never claims tested reachability', () => {
  const r = policyCheck([source, target], source, target, 80, 'TCP', true)
  assert.equal(r.verdict, 'Allowed by policy')
  assert.match(r.explanation, /not verified/)
})
test('default deny isolates only selected destination pods', () =>
  assert.equal(check([policy('deny')]), 'Denied by policy'))
test('allow rules are additive and destination port matters', () => {
  const allow = policy('allow', {
    ingress: [
      { from: [{ podSelector: { matchLabels: { role: 'client' } } }], ports: [{ port: 80 }] },
    ],
  })
  assert.equal(check([policy('deny'), allow]), 'Allowed by policy')
  assert.equal(check([allow], 81), 'Denied by policy')
})
test('source egress and destination ingress must both permit the flow', () => {
  const p = policy('egress', {
    podSelector: { matchLabels: { role: 'client' } },
    policyTypes: ['Egress'],
    egress: [],
  })
  assert.equal(check([p]), 'Denied by policy')
})
test('namespace and pod selectors on one peer are ANDed', () => {
  const p = policy('allow', {
    ingress: [
      {
        from: [
          {
            namespaceSelector: { matchLabels: { tenant: 'a' } },
            podSelector: { matchLabels: { role: 'client' } },
          },
        ],
      },
    ],
  })
  assert.equal(
    check([p], 80, true, [{ kind: 'Namespace', name: 'shop', labels: { tenant: 'b' } }]),
    'Denied by policy',
  )
  assert.equal(
    check([p], 80, true, [{ kind: 'Namespace', name: 'shop', labels: { tenant: 'a' } }]),
    'Allowed by policy',
  )
})
test('IP block evaluation stays unknown and stale/denied observations cannot grant access', () => {
  assert.equal(
    check([policy('cidr', { ingress: [{ from: [{ ipBlock: { cidr: '10.0.0.0/8' } }] }] })]),
    'Unknown',
  )
  assert.equal(check([], 80, false), 'Unknown')
})
test('named destination ports and ranges are evaluated with observed container port declarations', () => {
  const p = policy('named', { ingress: [{ ports: [{ port: 'http' }] }] })
  assert.equal(check([p]), 'Unknown')
  assert.equal(
    check([p], 80, true, [
      { kind: 'Container', parent: target.id, details: { 'port http': 'TCP/80' } },
    ]),
    'Allowed by policy',
  )
  assert.equal(
    check([policy('range', { ingress: [{ ports: [{ port: 80, endPort: 90 }] }] })], 85),
    'Allowed by policy',
  )
})
test('set selectors handle missing labels and unsupported operators explicitly', () => {
  assert.equal(
    matches({ matchExpressions: [{ key: 'role', operator: 'NotIn', values: ['db'] }] }, {}),
    true,
  )
  assert.equal(matches({ matchExpressions: [{ key: 'role', operator: 'Exists' }] }, {}), false)
  assert.equal(matches({ matchExpressions: [{ key: 'role', operator: 'Invalid' }] }, {}), null)
})
