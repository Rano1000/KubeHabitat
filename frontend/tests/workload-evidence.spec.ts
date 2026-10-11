import { test, expect } from '@playwright/test'

test('workload ancestry is clickable and lost telemetry does not become measured zero', async ({
  page,
}) => {
  const at = new Date().toISOString()
  const resource = (
    kind: string,
    uid: string,
    name: string,
    fields: Record<string, unknown> = {},
  ) => ({
    kind,
    uid,
    id: `${kind}:${uid}`,
    name,
    namespace: 'shop',
    observedAt: at,
    resourceVersion: '1',
    state: 'Ready',
    ...fields,
  })
  const deployment = resource('Deployment', 'deployment-uid', 'web', {
    details: { 'desired replicas': '2', 'ready replicas': '2' },
  })
  const set = resource('ReplicaSet', 'set-uid', 'web-rs', {
    owner: { kind: 'Deployment', uid: deployment.uid, name: deployment.name },
  })
  const pod = resource('Pod', 'pod-uid', 'web-pod', {
    ready: true,
    nodeName: 'worker-a',
    owner: { kind: 'ReplicaSet', uid: set.uid, name: set.name },
    usage: { cpuMilli: 0, memoryBytes: 8 * 1048576, timestamp: at, window: '15s' },
  })
  const container = resource('Container', 'pod-uid', 'app', {
    id: `${pod.id}/app/app`,
    parent: pod.id,
    containerType: 'app',
    state: 'Running',
    ready: true,
  })
  const snapshot = {
    schemaVersion: 1,
    sessionId: 'ownership-test',
    revision: 1,
    generatedAt: at,
    dataSource: 'kubernetes',
    cluster: 'test-habitat',
    connection: 'connected',
    metrics: { state: 'observing', reason: 'Kubernetes Metrics API' },
    visibility: ['Node', 'Namespace', 'Pod', 'Deployment', 'ReplicaSet'].map((kind) => ({
      kind,
      state: 'observing',
      synced: true,
      lastSuccess: at,
    })),
    resources: [pod, container, set, deployment],
  }
  let response: unknown = snapshot
  await page.route('**/api/v1/snapshot', (route) => route.fulfill({ json: response }))
  await page.goto('/#habitat')
  const inventory = page.getByRole('complementary', { name: 'Live resource inventory' })
  const details = page.getByRole('complementary', { name: 'Live component details' })
  await inventory.getByRole('button', { name: /web-pod Pod/ }).click()
  const ancestry = details.getByRole('region', { name: 'Workload ownership' })
  await expect(ancestry.getByRole('button', { name: 'web-rs', exact: true })).toBeVisible()
  const metrics = details.getByRole('region', { name: 'Resource metrics' })
  await expect(metrics.getByText('0 mCPU', { exact: true })).toBeVisible()
  await expect(metrics.getByText('8.0 MiB', { exact: true })).toBeVisible()
  await expect(metrics.getByRole('img', { name: 'CPU sample history in mCPU' })).toBeVisible()
  await ancestry.getByRole('button', { name: 'web-rs', exact: true }).click()
  await expect(details.getByRole('heading', { name: 'web-rs', exact: true })).toBeVisible()
  await details
    .getByRole('region', { name: 'Workload ownership' })
    .getByRole('button', { name: 'web', exact: true })
    .click()
  await expect(details.getByRole('heading', { name: 'web', exact: true })).toBeVisible()
  await inventory.getByRole('button', { name: /web-pod Pod/ }).click()
  await expect(metrics.getByText('0 mCPU', { exact: true })).toBeVisible()
  response = {
    ...snapshot,
    revision: 2,
    metrics: { state: 'unavailable', reason: 'Provider unavailable' },
    resources: snapshot.resources.map((r) => ({ ...r, usage: undefined })),
  }
  await expect(metrics.getByText(/Usage unknown.*Provider unavailable/)).toBeVisible()
  await expect(metrics.getByText('0 mCPU', { exact: true })).toHaveCount(0)
  await expect(metrics.getByText(/Prior samples are retained evidence/)).toBeVisible()
  await expect(details.getByRole('region', { name: 'Investigation', exact: true })).toHaveCount(1)
  await expect(details.getByRole('region', { name: 'Resource metrics', exact: true })).toHaveCount(
    1,
  )
})
