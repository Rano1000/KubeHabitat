import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clusterName = 'kubehabitat-lab'
const adminContext = `kind-${clusterName}`
const observerContext = 'kubehabitat-lab-observer'
let state = path.join(root, '.local', 'test-cluster')
let adminConfig = path.join(state, 'admin.json')
let observerConfig = path.join(state, 'observer.json')
let ownership = path.join(state, 'ownership.json')
const image =
  'kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5'

function options(args) {
  const result = {
    serve: false,
    help: false,
    kind: 'kind',
    binary: null,
    staticDir: null,
    stateDir: null,
  }
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    if (key === '--serve') result.serve = true
    else if (key === '--help') result.help = true
    else if (['--kind', '--binary', '--static-dir', '--state-dir'].includes(key)) {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}.`)
      result[
        key === '--static-dir' ? 'staticDir' : key === '--state-dir' ? 'stateDir' : key.slice(2)
      ] = value
    } else throw new Error(`Unknown option: ${key}`)
  }
  if (result.serve && (!result.binary || !result.staticDir)) {
    throw new Error('--serve requires --binary and --static-dir.')
  }
  return result
}

// Capture output so credential-bearing commands are never echoed to the terminal.
function run(command, args, { timeout = 30000, accepted = [0] } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, KIND_EXPERIMENTAL_PROVIDER: 'docker' },
  })
  if (result.error || !accepted.includes(result.status)) {
    // Do not include command output: errors from credential tools can contain sensitive data.
    throw new Error(
      `${path.basename(command)} ${args[0]} failed; check the tool and cluster availability.`,
    )
  }
  return (result.stdout ?? '').trim()
}

function admin(...args) {
  return run('kubectl', ['--kubeconfig', adminConfig, '--context', adminContext, ...args], {
    timeout: 150000,
  })
}

function checkAccess(verb, resource, expected, namespace) {
  const args = [
    '--kubeconfig',
    observerConfig,
    '--context',
    observerContext,
    'auth',
    'can-i',
    verb,
    resource,
  ]
  if (namespace) args.push('--namespace', namespace)
  const answer = run('kubectl', args, { accepted: [0, 1] })
  if (answer !== (expected ? 'yes' : 'no')) {
    throw new Error(`Observer permission check failed for ${verb} ${resource}.`)
  }
  return { verb, resource, namespace, allowed: expected }
}

async function main() {
  const settings = options(process.argv.slice(2))
  if (settings.help) {
    console.log(
      'Usage: node scripts/local-test-cluster.mjs [--kind PATH] [--state-dir PATH] [--serve --binary PATH --static-dir PATH]',
    )
    console.log(
      "Creates or reuses this checkout's kubehabitat-lab cluster. Docker Linux containers, kind and kubectl are required.",
    )
    console.log(
      'Generated credentials stay local; no default Kubernetes context is changed. The live preview uses port 19092.',
    )
    return
  }
  if (
    settings.serve &&
    (!existsSync(settings.binary) || !existsSync(path.join(settings.staticDir, 'index.html')))
  ) {
    throw new Error(
      'The built app is missing. Build the backend and frontend before using --serve.',
    )
  }
  let dockerType
  try {
    dockerType = run('docker', ['info', '--format', '{{.OSType}}'], { timeout: 20000 })
  } catch {
    throw new Error(
      'Open Docker Desktop and wait until its Linux engine is running, then run this launcher again.',
    )
  }
  if (dockerType !== 'linux') throw new Error('This test cluster requires Docker Linux containers.')
  run(settings.kind, ['version'])
  run('kubectl', ['version', '--client', '--output=json'])
  if (settings.stateDir) {
    state = path.resolve(settings.stateDir)
    adminConfig = path.join(state, 'admin.json')
    observerConfig = path.join(state, 'observer.json')
    ownership = path.join(state, 'ownership.json')
  }
  mkdirSync(state, { recursive: true, mode: 0o700 })
  const clusters = run(settings.kind, ['get', 'clusters']).split(/\r?\n/)
  if (clusters.includes(clusterName)) {
    if (
      !existsSync(ownership) ||
      JSON.parse(readFileSync(ownership, 'utf8')).cluster !== clusterName
    ) {
      throw new Error(
        `An existing ${clusterName} cluster is not owned by this checkout; it will not be modified.`,
      )
    }
    console.log("Reusing this checkout's KubeHabitat test cluster.")
    run(settings.kind, ['export', 'kubeconfig', '--name', clusterName, '--kubeconfig', adminConfig])
  } else {
    writeFileSync(
      ownership,
      JSON.stringify({ cluster: clusterName, createdAt: new Date().toISOString() }),
      { mode: 0o600 },
    )
    console.log(
      'Creating Kubernetes: one control-plane node and two workers. This may take a few minutes.',
    )
    run(
      settings.kind,
      [
        'create',
        'cluster',
        '--name',
        clusterName,
        '--config',
        path.join(root, 'deploy/local-test/cluster.yaml'),
        '--image',
        image,
        '--kubeconfig',
        adminConfig,
        '--wait',
        '120s',
      ],
      { timeout: 600000 },
    )
  }
  console.log('Installing sample workloads and a read-only observer.')
  admin('apply', '-f', path.join(root, 'deploy/local-test/namespaces.yaml'))
  admin('apply', '-f', path.join(root, 'deploy/rbac-readonly.yaml'))
  admin('apply', '-f', path.join(root, 'deploy/local-test/workloads.yaml'))
  admin('wait', '--for=condition=Ready', 'nodes', '--all', '--timeout=120s')
  admin(
    'rollout',
    'status',
    'deployment/habitat-web',
    '--namespace',
    'habitat-lab',
    '--timeout=120s',
  )

  const server = admin('config', 'view', '--minify', '-o', 'jsonpath={.clusters[0].cluster.server}')
  const ca = admin(
    'config',
    'view',
    '--minify',
    '--raw',
    '-o',
    'jsonpath={.clusters[0].cluster.certificate-authority-data}',
  )
  if (!/^https:\/\/127\.0\.0\.1:\d+$/.test(server) || !ca) {
    throw new Error(
      'The test API endpoint or CA is unexpected; observer credentials were not written.',
    )
  }
  const token = admin(
    'create',
    'token',
    'kubehabitat',
    '--namespace',
    'kubehabitat',
    '--duration=1h',
  )
  if (!token) throw new Error('No observer token was issued.')
  writeFileSync(
    observerConfig,
    JSON.stringify({
      apiVersion: 'v1',
      kind: 'Config',
      clusters: [{ name: clusterName, cluster: { server, 'certificate-authority-data': ca } }],
      contexts: [
        { name: observerContext, context: { cluster: clusterName, user: observerContext } },
      ],
      'current-context': observerContext,
      users: [{ name: observerContext, user: { token } }],
    }),
    { mode: 0o600 },
  )
  const permissions = [
    checkAccess('list', 'nodes', true),
    checkAccess('list', 'namespaces', true),
    checkAccess('list', 'pods', true, 'habitat-lab'),
    checkAccess('watch', 'pods', true, 'habitat-lab'),
    checkAccess('create', 'pods', false, 'habitat-lab'),
    checkAccess('delete', 'pods', false, 'habitat-lab'),
    checkAccess('get', 'secrets', false, 'habitat-lab'),
  ]
  writeFileSync(
    path.join(state, 'permission-checks.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), permissions }, null, 2),
  )
  console.log('Cluster ready. Read-only checks passed; writes and Secret reads are denied.')
  console.log(
    'Observer credentials are local and expire in about one hour. Rerun this launcher to renew them.',
  )
  if (!settings.serve) {
    console.log(
      'Start KubeHabitat with -live -kubeconfig .local/test-cluster/observer.json from the repository root.',
    )
    return
  }
  console.log('Live preview: http://127.0.0.1:19092/#live — leave this terminal open.')
  const serverProcess = spawn(
    settings.binary,
    [
      '-listen',
      '127.0.0.1:19092',
      '-live',
      '-kubeconfig',
      observerConfig,
      '-context',
      observerContext,
      '-cluster-name',
      clusterName,
      '-static-dir',
      settings.staticDir,
    ],
    { stdio: 'inherit' },
  )
  serverProcess.on('error', () => {
    console.error('Could not start the built KubeHabitat backend.')
    process.exitCode = 1
  })
  process.on('SIGINT', () => {
    // Windows delivers console Ctrl+C to both processes. child.kill() would force termination.
    if (process.platform !== 'win32') serverProcess.kill('SIGINT')
  })
  process.on('SIGTERM', () => serverProcess.kill('SIGTERM'))
  serverProcess.on('exit', (code) => {
    process.exitCode = code ?? 0
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
