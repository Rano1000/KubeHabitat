import { expect, test } from '@playwright/test'

test('demo stays honest while the API and development proxy are available', async ({
  page,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('Illustrative resources. Kubernetes is not connected.')).toBeVisible()
  await expect(page.getByText('Backend available · cluster disconnected')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await expect
    .poll(() =>
      page.locator('canvas').evaluate((canvas) => {
        const context = (canvas as HTMLCanvasElement).getContext('webgl2')
        return Boolean(context && !context.isContextLost())
      }),
    )
    .toBe(true)
  const proxy = await request.get(
    `http://127.0.0.1:${process.env.KUBEHABITAT_DEV_PORT ?? 5173}/api/v1/status`,
  )
  expect(proxy.ok()).toBe(true)
  expect(await proxy.json()).toMatchObject({ connection: 'disconnected', dataSource: 'demo' })
  const missing = await request.get('/api/v1/not-implemented')
  expect(missing.status()).toBe(404)
  expect(missing.headers()['content-type']).toContain('application/json')
  expect(errors).toEqual([])
})

test('resource selection, keyboard inspection, search, and parent navigation work together', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Containers/ }).click()
  const worker = page.getByRole('button', { name: /worker Container/ })
  await worker.focus()
  await page.keyboard.press('Enter')
  const inspector = page.getByRole('complementary', { name: 'Component details' })
  await expect(inspector.getByRole('heading', { name: 'worker', exact: true })).toBeVisible()
  await expect(inspector.getByText('CrashLoopBackOff', { exact: true })).toBeVisible()
  await expect(inspector.getByText('Local demo fixture')).toBeVisible()
  await inspector.getByRole('button', { name: 'worker-example', exact: true }).click()
  await expect(inspector.getByRole('heading', { name: 'worker-example' })).toBeVisible()
  await expect(inspector.getByText('NotReady', { exact: true })).toBeVisible()
  await expect(inspector.getByText('Running', { exact: true })).toBeVisible()
  await expect(inspector.getByText('false', { exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Find a component' }).fill('does-not-exist')
  await expect(page.getByText('No demo components match this search.')).toBeVisible()
  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect(page.getByRole('searchbox')).toHaveValue('')
  await expect(inspector.getByRole('heading', { name: 'Follow a component.' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause motion' }).click()
  await expect(page.getByRole('button', { name: 'Resume motion' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('field guide and mobile inspection respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByText('Reduced motion is enabled by your system.')).toBeVisible()
  await page.getByRole('button', { name: /^Pods/ }).click()
  await page.getByRole('button', { name: /web-example Pod/ }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'Component details' })
      .getByRole('heading', { name: 'web-example' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Field guide', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Understand the habitat.' })).toBeVisible()
  await expect(page.getByText('Namespace overlay · spans both rooms')).toBeVisible()
  const animation = await page
    .locator('.model-pod')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName)
  expect(animation).toBe('none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Pause animations' }).click()
  await expect(page.getByRole('button', { name: 'Resume animations' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(
    await page
      .locator('.model-pod')
      .first()
      .evaluate((element) => getComputedStyle(element).animationPlayState),
  ).toBe('paused')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('backend failure never turns fixtures into a live cluster', async ({ page }) => {
  await page.route('**/api/v1/status', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"unavailable"}',
    }),
  )
  await page.goto('/')
  await expect(page.getByText('Backend unavailable · local demo only')).toBeVisible()
  await page.getByRole('button', { name: /api-example Pod/ }).click()
  await expect(
    page.getByRole('complementary', { name: 'Component details' }).getByText('Local demo fixture'),
  ).toBeVisible()
})

test('a container is clickable through its pod wireframe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: /worker-example Pod/ }).click()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  const bounds = await page.locator('canvas').boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  const inspector = page.getByRole('complementary', { name: 'Component details' })
  await expect(inspector.getByRole('heading', { name: 'worker', exact: true })).toBeVisible()
  await expect(inspector.getByText('Container', { exact: true })).toBeVisible()
})

test('HTML inspection remains usable when WebGL cannot initialize', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null
        return Reflect.apply(original, this, [type, ...args])
      },
    })
  })
  await page.goto('/')
  await expect(page.getByText('3D view unavailable', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /api-example Pod/ }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'Component details' })
      .getByRole('heading', { name: 'api-example' }),
  ).toBeVisible()
})
