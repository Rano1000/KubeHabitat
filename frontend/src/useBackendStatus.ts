import { useEffect, useState } from 'react'

export type BackendStatus = {
  service: string
  version: string
  connection: 'disconnected' | 'connected' | 'partial'
  dataSource: 'demo' | 'kubernetes'
  message: string
}
export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus | null>(null)
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let disposed = false
    let request: AbortController | undefined
    async function refresh() {
      request?.abort()
      request = new AbortController()
      const timeout = window.setTimeout(() => request?.abort(), 4000)
      try {
        const response = await fetch('/api/v1/status', { signal: request.signal })
        if (!response.ok) throw new Error('Backend unavailable')
        const value: unknown = await response.json()
        if (
          !value ||
          typeof value !== 'object' ||
          !('connection' in value) ||
          !['disconnected', 'connected', 'partial'].includes(String(value.connection)) ||
          !('dataSource' in value) ||
          !['demo', 'kubernetes'].includes(String(value.dataSource)) ||
          !('service' in value) ||
          value.service !== 'kubehabitat' ||
          !('version' in value) ||
          typeof value.version !== 'string' ||
          !('message' in value) ||
          typeof value.message !== 'string'
        )
          throw new Error('Unexpected status response')
        if (!disposed) {
          setStatus(value as BackendStatus)
          setAvailable(true)
        }
      } catch {
        if (!disposed) {
          setAvailable(false)
          setStatus(null)
        }
      } finally {
        window.clearTimeout(timeout)
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 15000)
    return () => {
      disposed = true
      window.clearInterval(interval)
      request?.abort()
    }
  }, [])
  return { status, available }
}
