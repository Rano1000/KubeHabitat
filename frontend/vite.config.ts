import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const apiPort = Number(process.env.KUBEHABITAT_API_PORT ?? 8080)
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)
  throw new Error('Invalid API port')

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}`, '/healthz': `http://127.0.0.1:${apiPort}` },
  },
})
