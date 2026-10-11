import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveResource } from './useClusterSnapshot'
import { fetchEvidence, validInvestigation, validLogs } from './investigation'
import type { Investigation, LogEvidence } from './investigation'

export function InvestigationPanel({
  resource,
  fresh,
  intent,
}: {
  resource: LiveResource
  fresh: boolean
  intent?: { action: 'events' | 'logs'; nonce: number }
}) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<Investigation | null>(null)
  const [logs, setLogs] = useState<LogEvidence | null>(null)
  const [loading, setLoading] = useState<'events' | 'logs' | null>(null)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const load = useCallback(
    async (previous?: boolean) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      const timeout = window.setTimeout(() => controller.abort(), 12000)
      setError('')
      setLoading(previous === undefined ? 'events' : 'logs')
      if (previous === undefined) setEvents(null)
      else setLogs(null)
      try {
        if (previous === undefined)
          setEvents(
            await fetchEvidence(
              'investigation',
              resource.id,
              controller.signal,
              (value): value is Investigation => validInvestigation(value, resource.id),
            ),
          )
        else
          setLogs(
            await fetchEvidence(
              'logs',
              resource.id,
              controller.signal,
              (value): value is LogEvidence => validLogs(value, resource.id, previous),
              previous,
            ),
          )
      } catch (failure) {
        if (request.current === controller)
          setError(
            controller.signal.aborted
              ? 'Evidence request timed out. Retry when the backend is reachable.'
              : failure instanceof Error
                ? failure.message
                : 'Evidence is unavailable.',
          )
      } finally {
        window.clearTimeout(timeout)
        if (request.current === controller) setLoading(null)
      }
    },
    [resource.id],
  )
  useEffect(() => {
    if (!intent) return
    setOpen(true)
    if (intent.action === 'events') void load()
  }, [intent?.action, intent?.nonce, load])
  return (
    <section className="investigation-panel" aria-label="Investigation">
      <button
        className="investigate-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          if (!open && !events) void load()
        }}
      >
        <span aria-hidden="true">◎</span>
        <span>
          Investigate component<small>Events · evidence · container logs</small>
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="investigation-content">
          {!fresh && (
            <p className="scope-note">
              Scene status is retained or incomplete. These evidence reads have their own retrieval
              time.
            </p>
          )}
          <div className="investigation-actions">
            <h4>Reported events</h4>
            <button className="subtle-button" disabled={!!loading} onClick={() => void load()}>
              Refresh events
            </button>
          </div>
          {loading && (
            <p role="status">
              Fetching {loading === 'events' ? 'Kubernetes events' : 'container logs'}…
            </p>
          )}
          {error && (
            <p role="alert" className="evidence-unavailable">
              {error}
            </p>
          )}
          {events && (
            <>
              <p className="scope-note">
                {events.scope || 'Selected identity'} · UID {events.targetUid || 'not available'}
                <br />
                Kubernetes API · retrieved {new Date(events.observedAt).toLocaleString()}
              </p>
              {events.target.state !== 'available' && (
                <p className="evidence-unavailable">
                  {events.target.state}: {events.target.reason}
                </p>
              )}
              {events.events.state !== 'available' ? (
                <p className="evidence-unavailable">
                  Events {events.events.state}: {events.events.reason}
                </p>
              ) : (
                <>
                  {events.events.items.length === 0 && (
                    <p className="scope-note">
                      No retained events were returned for this UID. This does not prove there was
                      no earlier issue.
                    </p>
                  )}
                  <ol className="event-timeline">
                    {events.events.items.map((event, index) => (
                      <li key={`${event.uid}:${index}`} data-event-type={event.type}>
                        <div>
                          <strong>{event.reason || event.type || 'Reported event'}</strong>
                          <span>
                            {event.type} · ×{event.count}
                          </span>
                        </div>
                        <p>{event.message || 'No message reported.'}</p>
                        <small>
                          {event.lastObserved
                            ? new Date(event.lastObserved).toLocaleString()
                            : 'Event time not reported'}
                          {event.reporter ? ` · ${event.reporter}` : ''}
                        </small>
                        {event.fieldPath && <small>{event.fieldPath}</small>}
                      </li>
                    ))}
                  </ol>
                  {events.events.limited && (
                    <p className="scope-note">
                      Showing up to 30 events from the first 100 records returned. Additional
                      retained events may exist.
                    </p>
                  )}
                </>
              )}
              <p className="scope-note">
                Events describe what Kubernetes reported. Container and volume selections show their
                parent pod’s events; field paths identify a container when reported. Suggested
                checks above are guidance.
              </p>
            </>
          )}
          <div className="log-evidence">
            <h4>Container logs</h4>
            {resource.kind !== 'Container' ? (
              <p className="scope-note">
                Select a pod and then one of its containers to inspect the current or previous run.
                Each container has separate logs.
              </p>
            ) : (
              <>
                <div className="investigation-actions">
                  <button
                    className="subtle-button"
                    disabled={!!loading || events?.logsEnabled === false}
                    onClick={() => void load(false)}
                  >
                    Load current logs
                  </button>
                  <button
                    className="subtle-button"
                    disabled={!!loading || events?.logsEnabled === false}
                    onClick={() => void load(true)}
                  >
                    Load previous logs
                  </button>
                </div>
                {events?.logsEnabled === false && (
                  <p className="scope-note">
                    Log access is disabled on this backend. Enable -allow-logs and grant get on
                    pods/log.
                  </p>
                )}
                <p className="scope-note">
                  On request · up to 200 lines from the last 15 minutes · 64 KiB maximum.
                  Application logs may contain sensitive text; they are not automatically redacted
                  or saved.
                </p>
                {logs && (
                  <div aria-label="Retrieved container logs">
                    <strong>
                      {logs.previous ? 'Previous run' : 'Current run'} · {logs.state}
                    </strong>
                    <p className="scope-note">
                      {logs.source} · retrieved {new Date(logs.observedAt).toLocaleString()} · pod
                      UID {logs.podUid || 'not available'}
                    </p>
                    {logs.state === 'available' ? (
                      <>
                        <pre className="log-output" tabIndex={0} aria-label="Container log text">
                          <code>{logs.text || 'No log lines returned in this window.'}</code>
                        </pre>
                        {logs.truncated && (
                          <p className="scope-note">
                            Byte limit reached. The final line may be incomplete.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="evidence-unavailable">{logs.reason}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <p className="scope-note">
            Evidence is a snapshot. Refresh to retrieve newer information. Deleted pods and rotated
            logs may no longer be available.
          </p>
        </div>
      )}
    </section>
  )
}
