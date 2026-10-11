export type EvidenceStatus = { state: string; reason: string }
export type ReportedEvent = {
  uid: string
  type: string
  reason: string
  message: string
  count: number
  lastObserved?: string
  reporter?: string
  fieldPath?: string
}
export type Investigation = {
  resourceId: string
  targetUid?: string
  scope: string
  observedAt: string
  source: string
  target: EvidenceStatus
  events: EvidenceStatus & { items: ReportedEvent[]; limited: boolean }
  logsEnabled: boolean
}
export type LogEvidence = EvidenceStatus & {
  resourceId: string
  podUid?: string
  observedAt: string
  source: string
  previous: boolean
  text?: string
  truncated: boolean
  tailLines: number
  sinceSeconds: number
  byteLimit: number
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const states = [
  'available',
  'missing',
  'replaced',
  'denied',
  'unavailable',
  'disabled',
  'unsupported',
]
const status = (value: unknown) =>
  record(value) && states.includes(String(value.state)) && typeof value.reason === 'string'
const optional = (value: unknown) => value === undefined || typeof value === 'string'
export function validInvestigation(value: unknown, id: string): value is Investigation {
  return (
    record(value) &&
    value.resourceId === id &&
    date(value.observedAt) &&
    value.source === 'Kubernetes API' &&
    optional(value.targetUid) &&
    typeof value.scope === 'string' &&
    typeof value.logsEnabled === 'boolean' &&
    status(value.target) &&
    record(value.events) &&
    status(value.events) &&
    typeof value.events.limited === 'boolean' &&
    Array.isArray(value.events.items) &&
    value.events.items.length <= 30 &&
    value.events.items.every(
      (event) =>
        record(event) &&
        typeof event.uid === 'string' &&
        typeof event.type === 'string' &&
        typeof event.reason === 'string' &&
        typeof event.message === 'string' &&
        event.message.length <= 2048 &&
        Number.isInteger(event.count) &&
        Number(event.count) >= 1 &&
        (event.lastObserved === undefined || date(event.lastObserved)) &&
        optional(event.reporter) &&
        optional(event.fieldPath),
    )
  )
}
export function validLogs(value: unknown, id: string, previous: boolean): value is LogEvidence {
  return (
    record(value) &&
    status(value) &&
    value.resourceId === id &&
    value.previous === previous &&
    date(value.observedAt) &&
    value.source === 'Kubernetes pods/log' &&
    optional(value.podUid) &&
    optional(value.text) &&
    (typeof value.text !== 'string' || new TextEncoder().encode(value.text).length <= 65536) &&
    typeof value.truncated === 'boolean' &&
    value.tailLines === 200 &&
    value.sinceSeconds === 900 &&
    value.byteLimit === 65536 &&
    (value.state === 'available' || !value.text)
  )
}

export async function fetchEvidence<T>(
  route: string,
  id: string,
  signal: AbortSignal,
  valid: (value: unknown) => value is T,
  previous?: boolean,
): Promise<T> {
  const query = new URLSearchParams({ resource: id })
  if (previous !== undefined) query.set('previous', String(previous))
  const response = await fetch(`/api/v1/${route}?${query}`, { signal, cache: 'no-store' })
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Investigation is busy. Retry shortly.'
        : response.status === 404
          ? 'This backend does not provide investigation yet. Start the updated backend.'
          : response.status === 409
            ? 'Live discovery is disabled.'
            : 'Evidence request failed. Check backend connectivity and retry.',
    )
  const value: unknown = await response.json()
  if (!valid(value))
    throw new Error('Evidence response did not match the selected identity or supported format.')
  return value
}
