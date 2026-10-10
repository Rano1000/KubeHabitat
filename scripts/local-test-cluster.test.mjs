import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(new URL('./local-test-cluster.mjs', import.meta.url))

// Substitute native tools in a child process; no Docker or Kubernetes API is contacted.
const toolStub = `
import cp from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
const record = (command, args) => appendFileSync(process.env.LAB_CALLS, JSON.stringify({ command, args }) + '\\n');
cp.spawnSync = (command, args) => {
  record(command, args);
  let stdout = ''; let status = 0;
  if (command === 'docker') stdout = 'linux';
  else if (command === 'kind' && args[0] === 'get') stdout = process.env.LAB_CASE === 'unowned' ? 'kubehabitat-lab' : '';
  else if (command === 'kubectl') {
    if (args.includes('can-i')) {
      const index = args.indexOf('can-i');
      const verb = args[index + 1]; const resource = args[index + 2];
      const allowed = resource === 'secrets' ? process.env.LAB_CASE === 'overprivileged' : ['list', 'watch'].includes(verb);
      stdout = allowed ? 'yes' : 'no'; status = allowed ? 0 : 1;
    } else if (args.some(value => value.includes('certificate-authority-data}'))) stdout = 'TEST_CA';
    else if (args.some(value => value.includes('cluster.server}'))) stdout = 'https://127.0.0.1:6443';
    else if (args.includes('token')) stdout = 'TEST_TOKEN_NEVER_PRINT';
  }
  return { stdout, stderr: '', status };
};
cp.spawn = (command, args) => {
  record(command, args);
  const child = new EventEmitter(); child.kill = () => true;
  setImmediate(() => child.emit('exit', 0)); return child;
};
syncBuiltinESMExports();
`

function scenario(name, args, inspect) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'kubehabitat-lab-test-'))
  try {
    mkdirSync(path.join(temporary, 'scripts'))
    mkdirSync(path.join(temporary, 'frontend/dist'), { recursive: true })
    copyFileSync(script, path.join(temporary, 'scripts/local-test-cluster.mjs'))
    writeFileSync(path.join(temporary, 'frontend/dist/index.html'), '<title>test</title>')
    writeFileSync(path.join(temporary, 'backend.exe'), '')
    const preload = path.join(temporary, 'tools.mjs')
    const callsFile = path.join(temporary, 'calls.jsonl')
    writeFileSync(preload, toolStub)
    const result = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(preload).href, 'scripts/local-test-cluster.mjs', ...args],
      {
        cwd: temporary,
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, LAB_CASE: name, LAB_CALLS: callsFile },
      },
    )
    const calls = existsSync(callsFile)
      ? readFileSync(callsFile, 'utf8').trim().split('\n').map(JSON.parse)
      : []
    inspect({ result, calls, temporary })
  } finally {
    // Delete only the exact temporary directory created for this test.
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(temporary).startsWith('kubehabitat-lab-test-'))
    rmSync(temporary, { recursive: true, force: true })
  }
}

test('help never invokes Docker or Kubernetes', () => {
  scenario('help', ['--help'], ({ result, calls }) => {
    assert.equal(result.status, 0)
    assert.equal(calls.length, 0)
  })
})

test('a same-name unowned cluster is not mutated', () => {
  scenario('unowned', [], ({ result, calls }) => {
    assert.equal(result.status, 1)
    assert.match(result.stderr, /not owned by this checkout/)
    assert.ok(
      !calls.some(
        ({ args }) => args.includes('apply') || args.includes('create') || args.includes('export'),
      ),
    )
  })
})

test('lab operations use explicit contexts and the backend receives only observer credentials', () => {
  scenario(
    'normal',
    ['--serve', '--binary', 'backend.exe', '--static-dir', 'frontend/dist'],
    ({ result, calls, temporary }) => {
      assert.equal(result.status, 0, result.stderr)
      assert.ok(!(result.stdout + result.stderr).includes('TEST_TOKEN_NEVER_PRINT'))
      for (const call of calls.filter(
        ({ command, args }) => command === 'kubectl' && !args.includes('--client'),
      )) {
        assert.ok(call.args.includes('--kubeconfig'))
        assert.ok(call.args.includes('--context'))
        const context = call.args[call.args.indexOf('--context') + 1]
        assert.ok(['kind-kubehabitat-lab', 'kubehabitat-lab-observer'].includes(context))
      }
      const create = calls.find(({ command, args }) => command === 'kind' && args[0] === 'create')
      assert.ok(create.args.includes('--kubeconfig'))
      assert.ok(create.args.some((value) => value.startsWith('kindest/node:v1.37.0@sha256:')))
      const backend = calls.find(({ command }) => command === 'backend.exe')
      assert.ok(backend.args.includes(path.join(temporary, '.local/test-cluster/observer.json')))
      assert.ok(!backend.args.includes(path.join(temporary, '.local/test-cluster/admin.json')))
      const observer = JSON.parse(
        readFileSync(path.join(temporary, '.local/test-cluster/observer.json'), 'utf8'),
      )
      assert.equal(observer.users.length, 1)
      assert.equal(observer['current-context'], 'kubehabitat-lab-observer')
      const checks = JSON.parse(
        readFileSync(path.join(temporary, '.local/test-cluster/permission-checks.json'), 'utf8'),
      )
      assert.equal(checks.permissions.find(({ resource }) => resource === 'secrets').allowed, false)
    },
  )
})

test('unexpected Secret access prevents starting the backend', () => {
  scenario(
    'overprivileged',
    ['--serve', '--binary', 'backend.exe', '--static-dir', 'frontend/dist'],
    ({ result, calls }) => {
      assert.equal(result.status, 1)
      assert.match(result.stderr, /permission check failed for get secrets/)
      assert.ok(!calls.some(({ command }) => command === 'backend.exe'))
    },
  )
})
