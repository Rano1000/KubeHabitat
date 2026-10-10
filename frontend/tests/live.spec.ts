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
  await inventory.getByRole('button', { name: /worker Container/ }).click()
  const details = page.getByRole('complementary', { name: 'Live component details' })
  await expect(details.getByText('CrashLoopBackOff', { exact: true })).toBeVisible()
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
  await expect(
    page
      .getByRole('complementary', { name: 'Live component details' })
      .getByText('observed-uid', { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect(
    await page
      .locator('.orbit-ring')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none')
})
