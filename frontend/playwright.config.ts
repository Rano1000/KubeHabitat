import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const apiPort = Number(process.env.KUBEHABITAT_API_PORT ?? 8080)
const devPort = Number(process.env.KUBEHABITAT_DEV_PORT ?? 5173)
if (![apiPort, devPort].every((port) => Number.isInteger(port) && port > 0 && port < 65536))
  throw new Error('Invalid test port')

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${apiPort}`,
    viewport: { width: 1440, height: 1050 },
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.KUBEHABITAT_BROWSER_EXECUTABLE,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: [
    {
      command: `go run ./cmd/kubehabitat -listen 127.0.0.1:${apiPort} -static-dir ../frontend/dist`,
      cwd: path.resolve(import.meta.dirname, '../backend'),
      url: `http://127.0.0.1:${apiPort}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: `npm run dev -- --port ${devPort}`,
      url: `http://127.0.0.1:${devPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
})
