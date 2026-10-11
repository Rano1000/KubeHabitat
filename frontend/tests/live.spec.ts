import { expect, test } from '@playwright/test'

function snapshot(revision = 1) {
  const observedAt = new Date().toISOString()
  return {
    schemaVersion: 1,
    sessionId: 'browser-test',
    revision,
    generatedAt: observedAt,
    dataSource: 'kubernetes',
    cluster: 'test-habitat',
    connection: 'connected',
    visibility: ['Node', 'Namespace', 'Pod'].map((kind) => ({
      kind,
      state: 'observing',
      synced: true,
      lastSuccess: observedAt,
    })),
    resources: [
      {
        id: 'Pod:observed-uid',
        uid: 'observed-uid',
        kind: 'Pod',
        name: 'real-worker',
        namespace: 'shop',
        nodeName: 'worker-a',
        resourceVersion: '16',
        observedAt,
        phase: 'Running',
        state: 'NotReady',
        ready: false,
        conditions: [{ type: 'Ready', status: 'False', reason: 'ContainersNotReady' }],
      },
      {
        id: 'Pod:observed-uid/app/worker',
        uid: 'observed-uid',
        kind: 'Container',
        name: 'worker',
        parent: 'Pod:observed-uid',
        namespace: 'shop',
        resourceVersion: '16',
        observedAt,
        state: 'Waiting',
        reason: 'CrashLoopBackOff',
        ready: false,
        restartCount: 3,
        containerType: 'app',
      },
    ],
  }
}

test('live inventory inspects real identities without substituting demo components', async ({
  page,
}) => {
  let current = snapshot()
  await page.route('**/api/v1/snapshot', (route) => route.fulfill({ json: current }))
  await page.goto('/#live')
  await expect(page.getByRole('heading', { name: 'test-habitat' })).toBeVisible()
  const inventory = page.getByRole('complementary', { name: 'Live resource inventory' })
  const details = page.getByRole('complementary', { name: 'Live component details' })
  await inventory.getByRole('button', { name: /real-worker Pod/ }).click()
  await expect(
    details.getByText('Shell colour: normal · container issue.', { exact: true }),
  ).toBeVisible()
  await details.getByRole('button', { name: 'worker', exact: true }).click()
  await expect(
    details.getByText('Container colour: red · Crash loop.', { exact: true }),
  ).toBeVisible()
  await details.getByText('Identity, placement & observation', { exact: true }).click()
  await expect(
    details.locator('.identity-disclosure').getByText('CrashLoopBackOff', { exact: true }),
  ).toBeVisible()
  await expect(details.getByText('observed-uid', { exact: true })).toBeVisible()
  await details.getByRole('button', { name: 'real-worker' }).click()
  await expect(details.getByText('Running', { exact: true })).toBeVisible()
  await expect(details.getByText('false', { exact: true })).toBeVisible()
  await expect(inventory.getByText('web-example')).toHaveCount(0)
  current = { ...snapshot(2), resources: [] }
  await expect(details.getByRole('heading', { name: 'Component left the cache.' })).toBeVisible({
    timeout: 8000,
  })
  await expect(
    details.getByText('No crash or replacement has been inferred.', { exact: false }),
  ).toBeVisible()
})

test('lifecycle evidence distinguishes recovered container history from current completion', async ({
  page,
}) => {
  const current = snapshot()
  Object.assign(current.resources[1], {
    state: 'Running',
    ready: true,
    reason: undefined,
    lastTermination: { reason: 'OOMKilled', exitCode: 137, finishedAt: current.generatedAt },
  })
  await page.route('**/api/v1/snapshot', (route) => route.fulfill({ json: current }))
  await page.goto('/#live')
  await page.getByRole('button', { name: /real-worker Pod/ }).click()
  const details = page.getByRole('complementary', { name: 'Live component details' })
  await details.getByRole('button', { name: 'worker', exact: true }).click()
  const evidence = details.getByRole('region', { name: 'Lifecycle evidence' })
  await expect(evidence.getByRole('heading', { name: 'Ready', exact: true })).toBeVisible()
  await expect(evidence.getByText('Previous termination · historical status')).toBeVisible()
  await expect(evidence.getByText('OOMKilled', { exact: true })).toBeVisible()
  await expect(evidence.getByText('137', { exact: true })).toBeVisible()
  current.revision++
  Object.assign(current.resources[1], {
    state: 'Terminated',
    ready: false,
    exitCode: 0,
    reason: 'Completed',
    termination: { exitCode: 0, reason: 'Completed', finishedAt: current.generatedAt },
  })
  await expect(evidence.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible({
    timeout: 8000,
  })
  await expect(evidence.getByText('Current termination', { exact: true })).toBeVisible()
})

test('API failures retain cached objects and replace health verdicts with unknown freshness', async ({
  page,
}) => {
  let fail = false
  await page.route('**/api/v1/snapshot', (route) =>
    route.fulfill(fail ? { status: 503, json: { error: 'offline' } } : { json: snapshot() }),
  )
  await page.goto('/#live')
  await page.getByRole('button', { name: /real-worker Pod/ }).click()
  fail = true
  const details = page.getByRole('complementary', { name: 'Live component details' })
  await expect(details.getByText('Unknown freshness', { exact: true })).toBeVisible({
    timeout: 8000,
  })
  await expect(details.getByText('Last observed state: NotReady.', { exact: false })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Last observations are retained')
  fail = false
  await expect(details.getByText('NotReady', { exact: true })).toBeVisible({ timeout: 12000 })
})

test('disabled discovery and malformed snapshots never manufacture a live cluster', async ({
  page,
}) => {
  await page.route('**/api/v1/snapshot', (route) =>
    route.fulfill({ status: 409, json: { error: 'disabled' } }),
  )
  await page.goto('/#live')
  await expect(page.getByRole('alert')).toContainText('Live discovery is disabled')
  await expect(page.getByText('web-example')).toHaveCount(0)
  await page.unroute('**/api/v1/snapshot')
  await page.route('**/api/v1/snapshot', (route) =>
    route.fulfill({ json: { ...snapshot(), visibility: [] } }),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Missing resource visibility')
  await expect(page.getByText('real-worker')).toHaveCount(0)
})

test('live inspection remains usable on a narrow screen with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/snapshot', (route) => route.fulfill({ json: snapshot() }))
  await page.goto('/#live')
  await page.getByRole('button', { name: /real-worker Pod/ }).click()
  await page
    .getByRole('complementary', { name: 'Live component details' })
    .getByText('Identity, placement & observation', { exact: true })
    .click()
  await expect(
    page
      .getByRole('complementary', { name: 'Live component details' })
      .getByText('observed-uid', { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await expect(
    page.getByText('Reduced motion is enabled by your system.', { exact: false }),
  ).toBeVisible()
  await expect(page.getByLabel('Live cluster house')).toHaveAttribute('data-pod-count', '1')
})

test('Habitat opens actual snapshots by default and keeps house counts synchronized', async ({
  page,
}) => {
  let current = snapshot()
  await page.route('**/api/v1/snapshot', (route) => route.fulfill({ json: current }))
  await page.goto('/#habitat')
  const house = page.getByLabel('Live cluster house')
  await expect(house).toHaveAttribute('data-node-count', '0')
  await expect(house).toHaveAttribute('data-pod-count', '1')
  await expect(house).toHaveAttribute('data-container-count', '1')
  await expect(page.getByText('web-example')).toHaveCount(0)
  current = { ...snapshot(2), resources: [] }
  await expect(house).toHaveAttribute('data-pod-count', '0', { timeout: 8000 })
  await expect(house).toHaveAttribute('data-container-count', '0')
})

test('overview hides internals and pod storage exploration follows only its attachments', async ({
  page,
}) => {
  const current = snapshot()
  const object = (kind: string, name: string, extra = {}) => ({
    id: `${kind}:${name}`,
    uid: name,
    kind,
    name,
    namespace: 'shop',
    resourceVersion: '1',
    observedAt: current.generatedAt,
    state: 'Observed',
    ...extra,
  })
  current.visibility = [
    'Node',
    'Namespace',
    'Pod',
    'Service',
    'EndpointSlice',
    'PersistentVolumeClaim',
    'PersistentVolume',
    'StorageClass',
    'ResourceQuota',
    'Ingress',
    'NetworkPolicy',
  ].map((kind) => ({
    kind,
    state: 'observing',
    synced: true,
    lastSuccess: current.generatedAt,
  }))
  const resources = [
    ...current.resources,
    object('Node', 'worker-a', { namespace: undefined, state: 'Ready' }),
    object('Namespace', 'shop', { namespace: undefined }),
    object('Namespace', 'other', { namespace: undefined }),
    object('Pod', 'other-pod', { namespace: 'other', nodeName: 'worker-a' }),
    object('Service', 'checkout'),
    object('EndpointSlice', 'checkout-backends'),
    object('Volume', 'cache', {
      parent: 'Pod:observed-uid',
      details: { type: 'emptyDir', medium: 'Memory', 'size limit': '16Mi' },
    }),
    object('Volume', 'other-cache', { parent: 'Pod:other-pod', namespace: 'other' }),
  ]
  await page.route('**/api/v1/snapshot', (route) =>
    route.fulfill({ json: { ...current, resources } }),
  )
  await page.goto('/#habitat')
  const house = page.getByLabel('Live cluster house')
  const inventory = page.getByRole('complementary', { name: 'Live resource inventory' })
  const details = page.getByRole('complementary', { name: 'Live component details' })
  await expect(house).toHaveAttribute('data-service-count', '1')
  await expect(house).toHaveAttribute('data-storage-object-count', '0')
  await expect(house).toHaveAttribute('data-network-detail-count', '0')
  await expect(inventory.getByRole('button', { name: /checkout Service/ })).toBeVisible()
  await expect(
    inventory.getByRole('button', { name: /checkout-backends EndpointSlice/ }),
  ).toHaveCount(0)
  await inventory.getByRole('button', { name: /shop Namespace/ }).click()
  await expect(house).toHaveAttribute('data-namespace-scope', 'shop')
  await expect(house).toHaveAttribute('data-pod-count', '1')
  await inventory.getByRole('button', { name: /real-worker Pod/ }).click()
  await expect(details.getByText('16Mi', { exact: true })).toBeVisible()
  await details.getByRole('button', { name: 'Explore this pod’s storage', exact: true }).click()
  await expect(house).toHaveAttribute('data-storage-object-count', '1')
  await expect(inventory.getByRole('button', { name: /other-cache Volume/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect(house).toHaveAttribute('data-storage-object-count', '0')
  await expect(house).toHaveAttribute('data-service-count', '1')
})
