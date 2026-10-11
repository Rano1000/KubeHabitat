import { expect, test } from '@playwright/test'
// @ts-expect-error Node fixture is shared with the standalone CPU benchmark.
import { scaleFixture } from './scale-fixture.mjs'

test('large observations are grouped, warnings remain reachable, and replica pages have exact counts', async ({
  page,
}) => {
  const snapshot = scaleFixture(5000)
  await page.route('**/api/v1/snapshot', (route) => route.fulfill({ json: snapshot }))
  await page.goto('/#habitat')
  const scene = page.getByLabel('Live cluster house')
  await expect(scene).toHaveAttribute('data-pod-count', '5000')
  await expect(scene).toHaveAttribute('data-container-count', '10000')
  await expect(scene).toHaveAttribute('data-rendered-pod-count', '0')
  await expect(scene).toHaveAttribute('data-workload-group-count', '100')
  await page.getByRole('button', { name: 'Needs investigation / unknown', exact: true }).click()
  const inventory = page.getByRole('complementary', { name: 'Live resource inventory' })
  await inventory.locator('.workload-item').first().click()
  const group = page.getByLabel('Workload group details')
  await expect(group).toContainText('need investigation')
  await expect(scene).toHaveAttribute('data-rendered-pod-count', '48')
  await group.getByRole('button', { name: 'Investigate pod-00000' }).click()
  const details = page.getByRole('complementary', { name: 'Live component details' })
  await expect(details.getByRole('heading', { name: 'pod-00000', exact: true })).toBeVisible()
  await expect(scene).toHaveAttribute('data-rendered-pod-count', '1')
  await details.getByRole('button', { name: 'app', exact: true }).click()
  await details.getByText('Identity, placement & observation', { exact: true }).click()
  await expect(details).toContainText('CrashLoopBackOff')
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await inventory.locator('.workload-item').first().click()
  await group.getByRole('button', { name: 'Next replicas' }).click()
  await expect(group).toContainText('49–50 of 50 pods')
  await expect(scene).toHaveAttribute('data-rendered-pod-count', '2')
})

test('unchanged ETag heartbeats retain observations while changed stale visibility replaces health', async ({
  page,
}) => {
  const snapshot = scaleFixture(100)
  let stale = false,
    heartbeats = 0
  await page.route('**/api/v1/snapshot', (route) => {
    if (stale)
      return route.fulfill({
        headers: { ETag: '"stale"' },
        json: {
          ...snapshot,
          connection: 'disconnected',
          visibility: snapshot.visibility.map((v: Record<string, unknown>) => ({
            ...v,
            state: 'denied',
          })),
        },
      })
    if (route.request().headers()['if-none-match'] === '"initial"') {
      heartbeats++
      return route.fulfill({ status: 304, headers: { ETag: '"initial"' } })
    }
    return route.fulfill({ headers: { ETag: '"initial"' }, json: snapshot })
  })
  await page.goto('/#habitat')
  await expect.poll(() => heartbeats).toBeGreaterThan(0)
  await expect(page.getByLabel('Live cluster house')).toHaveAttribute('data-pod-count', '100')
  stale = true
  await expect(page.locator('.workload-list')).toContainText('unknown', { timeout: 8000 })
  await expect(page.locator('.workload-list')).not.toContainText('need investigation')
})
