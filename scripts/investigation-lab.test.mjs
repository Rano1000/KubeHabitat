import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const stub = `
import cp from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
cp.spawnSync=(command,args,options)=>{
  appendFileSync(process.env.LAB_CALLS,JSON.stringify({command,args,input:options.input})+'\\n');
  let stdout='{}',status=0,stderr='';
  const at=args.indexOf('get');
  if(at>=0){
    const resource=args[at+1];
    if(resource==='deployment') stdout=JSON.stringify({metadata:{labels:{'app.kubernetes.io/managed-by':'kubehabitat-test-lab'}}});
    else if(resource==='namespace') stdout=JSON.stringify({metadata:{labels:{'app.kubernetes.io/managed-by':process.env.LAB_CASE==='unowned-namespace'?'other':'kubehabitat-test-lab'}}});
    else if(resource==='pods,configmaps,roles,rolebindings') stdout=JSON.stringify({items:process.env.LAB_CASE==='unowned-object'?[{metadata:{name:'other'}}]:[]});
    else if(resource==='role'||resource==='rolebinding'){status=1;stderr='Error from server (NotFound)';}
  }
  return {status,stderr,stdout};
};
syncBuiltinESMExports();
`
function scenario(name, inspect) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'kubehabitat-investigation-'))
  try {
    for (const dir of ['scripts', 'frontend/src', 'deploy/local-test', '.local/test-cluster'])
      mkdirSync(path.join(temporary, dir), { recursive: true })
    for (const file of [
      'scripts/investigation-lab.mjs',
      'frontend/src/componentAppearance.ts',
      'frontend/src/lifecycle.ts',
      'deploy/rbac-investigation.yaml',
      'deploy/local-test/investigation.yaml',
    ])
      copyFileSync(path.join(root, file), path.join(temporary, file))
    writeFileSync(
      path.join(temporary, '.local/test-cluster/ownership.json'),
      JSON.stringify({ cluster: name === 'wrong-cluster' ? 'production' : 'kubehabitat-lab' }),
    )
    writeFileSync(path.join(temporary, 'stub.mjs'), stub)
    const callsFile = path.join(temporary, 'calls.jsonl')
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--import',
        pathToFileURL(path.join(temporary, 'stub.mjs')).href,
        'scripts/investigation-lab.mjs',
        'prepare',
      ],
      {
        cwd: temporary,
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, LAB_CASE: name, LAB_CALLS: callsFile },
      },
    )
    const calls = existsSync(callsFile)
      ? readFileSync(callsFile, 'utf8').trim().split('\n').map(JSON.parse)
      : []
    inspect(result, calls)
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(temporary).startsWith('kubehabitat-investigation-'))
    rmSync(temporary, { recursive: true, force: true })
  }
}
test('investigation faults never modify an unowned cluster or namespace', () => {
  for (const name of ['wrong-cluster', 'unowned-namespace', 'unowned-object'])
    scenario(name, (result, calls) => {
      assert.equal(result.status, 1)
      assert.ok(!calls.some((call) => call.args.includes('apply') || call.args.includes('patch')))
    })
})
test('investigation prepare uses explicit admin context and only dedicated workloads plus scoped evidence roles', () => {
  scenario('normal', (result, calls) => {
    assert.equal(result.status, 0, result.stderr)
    for (const call of calls) {
      assert.ok(call.args.includes('--kubeconfig'))
      assert.equal(call.args[call.args.indexOf('--context') + 1], 'kind-kubehabitat-lab')
    }
    const writes = calls.filter((call) => call.args.includes('apply'))
    assert.equal(writes.length, 3)
    assert.match(writes[0].input, /name: habitat-investigation/)
    assert.ok(!writes[0].input.includes('namespace: habitat-lab'))
    assert.ok(
      writes
        .slice(1)
        .every(
          (call) =>
            call.input.includes('resources: [pods/log]') && !call.input.includes('ClusterRole'),
        ),
    )
    assert.ok(!calls.some((call) => call.args.includes('delete') || call.args.includes('secrets')))
  })
})
