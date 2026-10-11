import { useEffect, useState } from 'react'

export const liveKinds = [
  'Node',
  'Namespace',
  'Pod',
  'Container',
  'Service',
  'EndpointSlice',
  'Ingress',
  'NetworkPolicy',
  'Volume',
  'PersistentVolumeClaim',
  'PersistentVolume',
  'StorageClass',
  'ResourceQuota',
  'Deployment',
  'ReplicaSet',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
] as const
export type Selector = {
  matchLabels?: Record<string, string>
  matchExpressions?: { key: string; operator: string; values?: string[] }[]
}
export type PolicyPeer = {
  podSelector?: Selector
  namespaceSelector?: Selector
  ipBlock?: { cidr: string; except?: string[] }
}
export type PolicyPort = { protocol?: string; port?: number | string; endPort?: number }
export type PolicyRule = { from?: PolicyPeer[]; to?: PolicyPeer[]; ports?: PolicyPort[] }
export type Policy = {
  podSelector: Selector
  policyTypes?: string[]
  ingress?: PolicyRule[]
  egress?: PolicyRule[]
}
export type LiveKind = (typeof liveKinds)[number]
export type Termination = {
  reason?: string
  exitCode: number
  startedAt?: string
  finishedAt?: string
}
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
  createdAt?: string
  phase?: string
  state: string
  ready?: boolean
  restartCount?: number
  containerType?: string
  reason?: string
  exitCode?: number
  startedAt?: string
  termination?: Termination
  lastTermination?: Termination
  deleting?: boolean
  conditions?: { type: string; status: string; reason?: string }[]
  labels?: Record<string, string>
  owner?: { uid: string; kind: string; name: string }
  details?: Record<string, string>
  links?: { kind: LiveKind; name?: string; namespace?: string; uid?: string; relation: string }[]
  policy?: Policy
  usage?: { cpuMilli: number; memoryBytes: number; timestamp: string; window: string }
}
export type Visibility = {
  kind: Exclude<LiveKind, 'Container' | 'Volume'>
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
  metrics?: { state: string; reason: string }
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const selector = (v: unknown): boolean =>
  record(v) &&
  (v.matchLabels === undefined ||
    (record(v.matchLabels) && Object.values(v.matchLabels).every((n) => typeof n === 'string'))) &&
  (v.matchExpressions === undefined ||
    (Array.isArray(v.matchExpressions) &&
      v.matchExpressions.every(
        (e) =>
          record(e) &&
          typeof e.key === 'string' &&
          typeof e.operator === 'string' &&
          (e.values === undefined ||
            (Array.isArray(e.values) && e.values.every((n) => typeof n === 'string'))),
      )))
function validPolicy(value: unknown): boolean {
  if (!record(value) || !selector(value.podSelector)) return false
  if (
    value.policyTypes !== undefined &&
    (!Array.isArray(value.policyTypes) ||
      !value.policyTypes.every((v) => ['Ingress', 'Egress'].includes(String(v))))
  )
    return false
  return ['ingress', 'egress'].every(
    (key) =>
      value[key] === undefined ||
      (Array.isArray(value[key]) &&
        value[key].every(
          (rule) =>
            record(rule) &&
            ['from', 'to'].every(
              (direction) =>
                rule[direction] === undefined ||
                (Array.isArray(rule[direction]) &&
                  rule[direction].every(
                    (p) =>
                      record(p) &&
                      (p.podSelector === undefined || selector(p.podSelector)) &&
                      (p.namespaceSelector === undefined || selector(p.namespaceSelector)) &&
                      (p.ipBlock === undefined ||
                        (record(p.ipBlock) && typeof p.ipBlock.cidr === 'string')),
                  )),
            ) &&
            (rule.ports === undefined ||
              (Array.isArray(rule.ports) &&
                rule.ports.every(
                  (p) =>
                    record(p) &&
                    (p.protocol === undefined ||
                      ['TCP', 'UDP', 'SCTP'].includes(String(p.protocol))) &&
                    (p.port === undefined ||
                      typeof p.port === 'string' ||
                      (Number.isInteger(p.port) &&
                        Number(p.port) > 0 &&
                        Number(p.port) <= 65535)) &&
                    (p.endPort === undefined ||
                      (Number.isInteger(p.endPort) &&
                        Number(p.endPort) >= Number(p.port) &&
                        Number(p.endPort) <= 65535)),
                ))),
        )),
  )
}

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
    const owner = r.owner
    if (
      owner !== undefined &&
      (!record(owner) ||
        !['uid', 'kind', 'name'].every(
          (key) => typeof owner[key] === 'string' && owner[key] !== '',
        ))
    )
      throw new Error('Invalid controlling owner')
    for (const field of ['labels', 'details']) {
      if (
        r[field] !== undefined &&
        (!record(r[field]) || !Object.values(r[field]).every((v) => typeof v === 'string'))
      )
        throw new Error('Invalid resource metadata')
    }
    if (
      r.links !== undefined &&
      (!Array.isArray(r.links) ||
        !r.links.every(
          (l) =>
            record(l) &&
            liveKinds.includes(l.kind as LiveKind) &&
            typeof l.relation === 'string' &&
            ['name', 'namespace', 'uid'].every(
              (k) => l[k] === undefined || typeof l[k] === 'string',
            ),
        ))
    )
      throw new Error('Invalid relationship')
    if (
      r.usage !== undefined &&
      (!record(r.usage) ||
        !Number.isFinite(r.usage.cpuMilli) ||
        Number(r.usage.cpuMilli) < 0 ||
        !Number.isFinite(r.usage.memoryBytes) ||
        Number(r.usage.memoryBytes) < 0 ||
        !date(r.usage.timestamp) ||
        typeof r.usage.window !== 'string')
    )
      throw new Error('Invalid usage sample')
    if (r.policy !== undefined && !validPolicy(r.policy))
      throw new Error('Invalid policy observation')
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
    if (r.startedAt !== undefined && !date(r.startedAt)) throw new Error('Invalid start time')
    if (r.createdAt !== undefined && !date(r.createdAt)) throw new Error('Invalid creation time')
    for (const field of ['termination', 'lastTermination']) {
      const evidence = r[field]
      if (
        evidence !== undefined &&
        (!record(evidence) ||
          !Number.isInteger(evidence.exitCode) ||
          (evidence.reason !== undefined && typeof evidence.reason !== 'string') ||
          ['startedAt', 'finishedAt'].some(
            (key) => evidence[key] !== undefined && !date(evidence[key]),
          ))
      )
        throw new Error('Invalid termination evidence')
    }
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
      !liveKinds
        .filter((k) => k !== 'Container' && k !== 'Volume')
        .includes(v.kind as Exclude<LiveKind, 'Container' | 'Volume'>) ||
      kinds.has(String(v.kind)) ||
      !['connecting', 'observing', 'reconnecting', 'denied', 'stale'].includes(String(v.state)) ||
      typeof v.synced !== 'boolean' ||
      (v.lastSuccess !== undefined && !date(v.lastSuccess)) ||
      (v.reason !== undefined && typeof v.reason !== 'string')
    )
      throw new Error('Invalid visibility observation')
    kinds.add(String(v.kind))
  }
  if (!['Node', 'Namespace', 'Pod'].every((k) => kinds.has(k)))
    throw new Error('Missing resource visibility')
  if (
    value.metrics !== undefined &&
    (!record(value.metrics) ||
      typeof value.metrics.state !== 'string' ||
      typeof value.metrics.reason !== 'string')
  )
    throw new Error('Invalid telemetry state')
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
    let etag: string | null = null
    async function refresh() {
      const request = new AbortController()
      controller = request
      const timeout = setTimeout(() => request.abort(), 4000)
      try {
        const response = await fetch('/api/v1/snapshot', {
          signal: request.signal,
          cache: 'no-store',
          headers: etag ? { 'If-None-Match': etag } : undefined,
        })
        if (response.status === 304) {
          if (!previous || !etag)
            throw new Error('Unexpected snapshot heartbeat without an observation')
          if (!disposed) {
            setReceivedAt(Date.now())
            setError(null)
            setResynced(failed)
          }
          failed = false
          retry = 2000
          return
        }
        if (response.status === 409)
          throw new Error(
            'Live discovery is disabled. Start the backend with -live and a read-only Kubernetes context.',
          )
        if (!response.ok)
          throw new Error(
            'Live API unavailable. Last observations are retained, with their freshness marked unknown.',
          )
        const next = parseSnapshot(await response.json())
        etag = response.headers.get('ETag')
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
    age: receivedAt ? Math.max(0, Math.floor((now - receivedAt) / 1000)) : null,
    stale: !!error || !receivedAt || now - receivedAt > 10000,
  }
}
