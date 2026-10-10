import { useEffect, useState } from 'react'

export const liveKinds = ['Node', 'Namespace', 'Pod', 'Container'] as const
export type LiveKind = (typeof liveKinds)[number]
export type LiveResource = {
  id: string
  uid: string
  kind: LiveKind
  name: string
  namespace?: string
  nodeName?: string
  parent?: string
  resourceVersion: string
  observedAt: string
  phase?: string
  state: string
  ready?: boolean
  restartCount?: number
  containerType?: string
  reason?: string
  exitCode?: number
  deleting?: boolean
  conditions?: { type: string; status: string; reason?: string }[]
}
export type Visibility = {
  kind: Exclude<LiveKind, 'Container'>
  state: 'connecting' | 'observing' | 'reconnecting' | 'denied' | 'stale'
  synced: boolean
  lastSuccess?: string
  reason?: string
}
export type ClusterSnapshot = {
  schemaVersion: 1
  sessionId: string
  revision: number
  generatedAt: string
  dataSource: 'kubernetes'
  cluster: string
  connection: 'connected' | 'partial' | 'disconnected'
  visibility: Visibility[]
  resources: LiveResource[]
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))

export function parseSnapshot(value: unknown): ClusterSnapshot {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.dataSource !== 'kubernetes' ||
    typeof value.sessionId !== 'string' ||
    typeof value.cluster !== 'string' ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !date(value.generatedAt) ||
    !['connected', 'partial', 'disconnected'].includes(String(value.connection)) ||
    !Array.isArray(value.resources) ||
    !Array.isArray(value.visibility)
  )
    throw new Error('Unsupported snapshot contract')
  const ids = new Set<string>()
  for (const r of value.resources) {
    if (
      !record(r) ||
      typeof r.id !== 'string' ||
      ids.has(r.id) ||
      typeof r.uid !== 'string' ||
      !liveKinds.includes(r.kind as LiveKind) ||
      typeof r.name !== 'string' ||
      typeof r.resourceVersion !== 'string' ||
      !date(r.observedAt) ||
      typeof r.state !== 'string'
    )
      throw new Error('Invalid resource observation')
    ids.add(r.id)
    for (const field of ['namespace', 'nodeName', 'parent', 'phase', 'containerType', 'reason']) {
      if (r[field] !== undefined && typeof r[field] !== 'string')
        throw new Error('Invalid resource field')
    }
    if (r.ready !== undefined && typeof r.ready !== 'boolean') throw new Error('Invalid readiness')
    if (r.deleting !== undefined && typeof r.deleting !== 'boolean')
      throw new Error('Invalid deletion state')
    if (
      r.restartCount !== undefined &&
      (!Number.isSafeInteger(r.restartCount) || (r.restartCount as number) < 0)
    )
      throw new Error('Invalid restart count')
    if (r.exitCode !== undefined && !Number.isInteger(r.exitCode))
      throw new Error('Invalid exit code')
    if (
      r.conditions !== undefined &&
      (!Array.isArray(r.conditions) ||
        !r.conditions.every(
          (c) =>
            record(c) &&
            typeof c.type === 'string' &&
            typeof c.status === 'string' &&
            (c.reason === undefined || typeof c.reason === 'string'),
        ))
    )
      throw new Error('Invalid conditions')
  }
  const kinds = new Set<string>()
  for (const v of value.visibility) {
    if (
      !record(v) ||
      !['Node', 'Namespace', 'Pod'].includes(String(v.kind)) ||
      kinds.has(String(v.kind)) ||
      !['connecting', 'observing', 'reconnecting', 'denied', 'stale'].includes(String(v.state)) ||
      typeof v.synced !== 'boolean' ||
      (v.lastSuccess !== undefined && !date(v.lastSuccess)) ||
      (v.reason !== undefined && typeof v.reason !== 'string')
    )
      throw new Error('Invalid visibility observation')
    kinds.add(String(v.kind))
  }
  if (kinds.size !== 3) throw new Error('Missing resource visibility')
  return value as ClusterSnapshot
}

export function useClusterSnapshot() {
  const [snapshot, setSnapshot] = useState<ClusterSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resynced, setResynced] = useState(false)
  const [receivedAt, setReceivedAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | undefined
    let previous: ClusterSnapshot | null = null
    let failed = false
    let retry = 2000
    async function refresh() {
      const request = new AbortController()
      controller = request
      const timeout = setTimeout(() => request.abort(), 4000)
      try {
        const response = await fetch('/api/v1/snapshot', { signal: request.signal })
        if (response.status === 409)
          throw new Error(
            'Live discovery is disabled. Start the backend with -live and a read-only Kubernetes context.',
          )
        if (!response.ok)
          throw new Error(
            'Live API unavailable. Last observations are retained, with their freshness marked unknown.',
          )
        const next = parseSnapshot(await response.json())
        if (previous?.sessionId === next.sessionId && next.revision < previous.revision)
          throw new Error('Out-of-order snapshot rejected; waiting for a fresh cache.')
        if (!disposed) {
          setResynced(failed || (!!previous && previous.sessionId !== next.sessionId))
          setSnapshot(next)
          setReceivedAt(Date.now())
          setError(null)
        }
        previous = next
        failed = false
        retry = 2000
      } catch (reason) {
        if (!disposed)
          setError(
            reason instanceof Error && reason.name !== 'AbortError'
              ? reason.message
              : 'Live API did not respond. Cached state is not a current health signal.',
          )
        failed = true
        retry = Math.min(retry * 2, 15000)
      } finally {
        clearTimeout(timeout)
        if (!disposed) timer = setTimeout(() => void refresh(), retry)
      }
    }
    void refresh()
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      disposed = true
      clearTimeout(timer)
      clearInterval(clock)
      controller?.abort()
    }
  }, [])
  return {
    snapshot,
    error,
    resynced,
    age: receivedAt ? Math.floor((now - receivedAt) / 1000) : null,
    stale: !!error || !receivedAt || now - receivedAt > 10000,
  }
}
