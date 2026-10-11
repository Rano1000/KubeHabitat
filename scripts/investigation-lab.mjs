import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { componentAppearance } from '../frontend/src/componentAppearance.ts'
import { previousFailureVerified } from './investigation-evidence.mjs'

const root = path.resolve(import.meta.dirname, '..')
const ns = 'habitat-investigation'
const args = process.argv.slice(2)
const action = args.shift()
if (!['prepare', 'recover', 'check'].includes(action))
  throw new Error(
    'Use prepare, recover or check, with --state-dir PATH and optional --kubectl PATH / --port NUMBER.',
  )
const settings = {
  stateDir: path.join(root, '.local/test-cluster'),
  kubectl: 'kubectl',
  port: 19096,
}
while (args.length) {
  const key = args.shift(),
    value = args.shift()
  if (!value || !['--state-dir', '--kubectl', '--port'].includes(key))
    throw new Error('Invalid lab option.')
  settings[key === '--state-dir' ? 'stateDir' : key.slice(2)] =
    key === '--port' ? Number(value) : value
}
if (!Number.isInteger(settings.port) || settings.port < 1024 || settings.port > 65535)
  throw new Error('Invalid preview port.')
const state = path.resolve(settings.stateDir)
const owner = JSON.parse(readFileSync(path.join(state, 'ownership.json'), 'utf8'))
if (owner.cluster !== 'kubehabitat-lab')
  throw new Error('Only the owned kubehabitat-lab can be tested.')
function admin(command, options, input, allowMissing = false) {
  const result = spawnSync(
    settings.kubectl,
    [
      '--kubeconfig',
      path.join(state, 'admin.json'),
      '--context',
      'kind-kubehabitat-lab',
      '--request-timeout=8s',
      command,
      ...options,
    ],
    { input, encoding: 'utf8', timeout: 20000, windowsHide: true },
  )
  if (result.error || result.status !== 0) {
    if (allowMissing && result.stderr?.includes('(NotFound)')) return null
    throw new Error(`Lab ${command} failed; tool output withheld to protect credentials.`)
  }
  return result.stdout.trim()
}
const deployed = JSON.parse(
  admin('get', ['deployment', 'habitat-web', '-n', 'habitat-lab', '-o', 'json']),
)
if (deployed.metadata?.labels?.['app.kubernetes.io/managed-by'] !== 'kubehabitat-test-lab')
  throw new Error('Existing lab ownership could not be verified.')
const existing = admin('get', ['namespace', ns, '-o', 'json'], undefined, true)
if (
  existing &&
  JSON.parse(existing).metadata?.labels?.['app.kubernetes.io/managed-by'] !== 'kubehabitat-test-lab'
)
  throw new Error('The investigation namespace is not owned by this lab.')
if (action === 'prepare') {
  if (existing) {
    const owned = JSON.parse(
      admin('get', ['pods,configmaps,roles,rolebindings', '-n', ns, '-o', 'json']),
    )
    if (
      owned.items.some(
        (item) =>
          item.metadata?.labels?.['app.kubernetes.io/managed-by'] !== 'kubehabitat-test-lab' &&
          item.metadata?.name !== 'kube-root-ca.crt',
      )
    )
      throw new Error('Unowned objects exist in the investigation namespace.')
  }
  admin(
    'apply',
    ['-f', '-'],
    readFileSync(path.join(root, 'deploy/local-test/investigation.yaml'), 'utf8'),
  )
  const roles = readFileSync(path.join(root, 'deploy/rbac-investigation.yaml'), 'utf8')
  // The existing lab's default RBAC is unchanged; extra evidence access is namespaced.
  for (const scope of ['habitat-lab', ns]) {
    for (const kind of ['role', 'rolebinding']) {
      const present = admin(
        'get',
        [kind, 'kubehabitat-investigation', '-n', scope, '-o', 'json'],
        undefined,
        true,
      )
      if (
        present &&
        JSON.parse(present).metadata?.labels?.['app.kubernetes.io/managed-by'] !==
          'kubehabitat-test-lab'
      )
        throw new Error('Existing investigation permissions are not lab-owned.')
    }
    admin('apply', ['-f', '-'], roles.replaceAll('namespace: habitat-lab', `namespace: ${scope}`))
  }
  console.log(
    'Five deliberate acceptance workloads installed only in habitat-investigation. Namespaced event/log reads enabled; the observer has no workload writes or Secret reads.',
  )
} else if (action === 'recover') {
  if (!existing) throw new Error('Prepare the investigation namespace first.')
  const gate = JSON.parse(admin('get', ['configmap', 'recovery-gate', '-n', ns, '-o', 'json']))
  if (gate.metadata?.labels?.['app.kubernetes.io/managed-by'] !== 'kubehabitat-test-lab')
    throw new Error('Recovery gate is not lab-owned.')
  admin('patch', [
    'configmap',
    'recovery-gate',
    '-n',
    ns,
    '--type=merge',
    '-p',
    JSON.stringify({ data: { recover: 'yes' } }),
  ])
  console.log(
    'Recovery enabled for the deliberate crashing container. ConfigMap propagation and restart backoff can take several minutes; the pod UID stays the same.',
  )
} else {
  const base = `http://127.0.0.1:${settings.port}`
  const fetchJSON = async (route) => {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw new Error(`Preview request failed: HTTP ${response.status}`)
    return response.json()
  }
  const snapshot = await fetchJSON('/api/v1/snapshot')
  if (snapshot.cluster !== 'kubehabitat-lab' || snapshot.dataSource !== 'kubernetes')
    throw new Error('Not the live local lab.')
  const visibility = snapshot.visibility.find((v) => v.kind === 'Pod')
  if (visibility?.state !== 'observing' || !visibility.synced)
    throw new Error('Pod observations are not current.')
  const resources = snapshot.resources.filter((r) => r.namespace === ns)
  const find = (name) => resources.find((r) => r.kind === 'Pod' && r.name === name)
  const children = (pod) => resources.filter((r) => r.kind === 'Container' && r.parent === pod.id)
  const assertions = []
  const check = (name, passed) => {
    assertions.push({ name, passed })
    if (!passed) console.log(`Not ready or failed: ${name}`)
  }
  const split = find('split-container')
  if (!split) throw new Error('Prepare the lab and wait for its workloads.')
  const boxes = children(split),
    crashing = boxes.find((r) => r.name === 'crashing'),
    healthy = boxes.find((r) => r.name === 'healthy')
  const gate = JSON.parse(admin('get', ['configmap', 'recovery-gate', '-n', ns, '-o', 'json']))
  const recovering = gate.data?.recover === 'yes'
  check(
    'normal pod shell for container-only issue or recovered readiness',
    componentAppearance(split, boxes, () => true).tone === 'normal',
  )
  check(
    'healthy sibling remains normal',
    !!healthy && componentAppearance(healthy, [], () => true).tone === 'normal',
  )
  check(
    recovering ? 'recovered container normal with restart evidence' : 'crash-loop container red',
    !!crashing &&
      componentAppearance(crashing, [], () => true).tone === (recovering ? 'normal' : 'danger') &&
      (!recovering || crashing.restartCount > 0),
  )
  for (const [name, tone] of [
    ['image-waiting', 'normal'],
    ['unscheduled', 'warning'],
    ['failed-task', 'danger'],
    ['completed-task', 'complete'],
  ]) {
    const pod = find(name)
    check(
      `${name} shell ${tone}`,
      !!pod && componentAppearance(pod, children(pod), () => true).tone === tone,
    )
  }
  const waiting = find('image-waiting')
  check(
    'waiting container yellow',
    !!waiting &&
      children(waiting).some((r) => componentAppearance(r, [], () => true).tone === 'warning'),
  )
  const evidence = await fetchJSON(
    `/api/v1/investigation?resource=${encodeURIComponent(crashing.id)}`,
  )
  check(
    'events retrieved for exact pod UID',
    evidence.targetUid === split.uid &&
      evidence.events.state === 'available' &&
      evidence.events.items.some((e) => e.type === 'Warning'),
  )
  const logs = await fetchJSON(
    `/api/v1/logs?resource=${encodeURIComponent(crashing.id)}&previous=true`,
  )
  // Recovery can outlive the runtime's previous-log retention. Require a passing
  // fault-run report for this exact UID before accepting explicit unavailability.
  let prior
  if (recovering) {
    try {
      prior = JSON.parse(readFileSync(path.join(state, 'investigation-faults-checks.json'), 'utf8'))
    } catch {
      /* No prior report: unavailable logs cannot pass recovery acceptance. */
    }
  }
  check(
    recovering
      ? 'previous failure logs retained or explicitly unavailable after verified fault run'
      : 'previous failed run logs available',
    previousFailureVerified(logs, split.uid, recovering, prior),
  )
  if (recovering) {
    const current = await fetchJSON(
      `/api/v1/logs?resource=${encodeURIComponent(crashing.id)}&previous=false`,
    )
    check(
      'recovered current logs distinct from previous failure',
      current.state === 'available' &&
        current.text?.includes('Recovered acceptance container') &&
        crashing.lastTermination?.exitCode === 42,
    )
  }
  const report = {
    checkedAt: new Date().toISOString(),
    mode: recovering ? 'recovered' : 'faults',
    podUid: split.uid,
    assertions,
  }
  writeFileSync(
    path.join(state, `investigation-${report.mode}-checks.json`),
    JSON.stringify(report, null, 2),
  )
  console.log(
    `${assertions.filter((a) => a.passed).length}/${assertions.length} real-cluster checks passed. Report saved locally without event messages or log bodies.`,
  )
  if (assertions.some((a) => !a.passed)) process.exitCode = 1
}
