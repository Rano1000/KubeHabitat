import type { LiveResource, Termination } from './useClusterSnapshot'
import {
  lifecycle,
  lifecycleExplanation,
  lifecycleLabels,
  lifecycleMarks,
  suggestedCheck,
} from './lifecycle'

function TerminationFacts({ value, title }: { value: Termination; title: string }) {
  return (
    <div className="termination-facts">
      <h5>{title}</h5>
      <dl>
        <div>
          <dt>Reason</dt>
          <dd>{value.reason || 'Not reported'}</dd>
        </div>
        <div>
          <dt>Exit code</dt>
          <dd>{value.exitCode}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{value.startedAt ? new Date(value.startedAt).toLocaleString() : 'Not reported'}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{value.finishedAt ? new Date(value.finishedAt).toLocaleString() : 'Not reported'}</dd>
        </div>
      </dl>
    </div>
  )
}

export function LifecycleEvidence({
  resource,
  fresh,
  children,
  onSelect,
}: {
  resource: LiveResource
  fresh: (r: LiveResource) => boolean
  children: LiveResource[]
  onSelect: (id: string) => void
}) {
  const state = lifecycle(resource, fresh(resource))
  const issues = children.filter((c) =>
    ['failed', 'waiting', 'not-ready', 'unknown'].includes(lifecycle(c, fresh(c))),
  )
  return (
    <section className={`lifecycle-evidence lifecycle-${state}`} aria-label="Lifecycle evidence">
      <div className="lifecycle-heading">
        <span aria-hidden="true">{lifecycleMarks[state]}</span>
        <h4>{lifecycleLabels[state]}</h4>
      </div>
      <p>{lifecycleExplanation(resource, fresh(resource))}</p>
      <dl>
        <div>
          <dt>Evidence source</dt>
          <dd>
            Kubernetes {resource.kind === 'Pod' ? 'Pod status' : 'container status in parent Pod'}
          </dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{new Date(resource.observedAt).toLocaleString()}</dd>
        </div>
        {resource.reason && (
          <div>
            <dt>Reported reason</dt>
            <dd>{resource.reason}</dd>
          </div>
        )}
        {resource.restartCount !== undefined && (
          <div>
            <dt>Reported restarts</dt>
            <dd>{resource.restartCount} · within this pod identity</dd>
          </div>
        )}
        {resource.startedAt && (
          <div>
            <dt>Current run started</dt>
            <dd>{new Date(resource.startedAt).toLocaleString()}</dd>
          </div>
        )}
      </dl>
      {resource.termination && (
        <TerminationFacts value={resource.termination} title="Current termination" />
      )}
      {resource.lastTermination && (
        <TerminationFacts
          value={resource.lastTermination}
          title="Previous termination · historical status"
        />
      )}
      {resource.kind === 'Container' &&
        !resource.lastTermination &&
        (resource.restartCount ?? 0) > 0 && (
          <p className="scope-note">
            Earlier termination details are not reported. The restart count is not a complete
            history.
          </p>
        )}
      {issues.length > 0 && (
        <div className="lifecycle-children">
          <h5>Containers to inspect</h5>
          {issues.map((child) => (
            <button className="text-link" key={child.id} onClick={() => onSelect(child.id)}>
              {child.name} · {lifecycleLabels[lifecycle(child, fresh(child))]}
              {child.reason ? ` · ${child.reason}` : ''}
            </button>
          ))}
        </div>
      )}
      {((state !== 'ready' && state !== 'completed') || resource.lastTermination) && (
        <details>
          <summary>Suggested next check</summary>
          <p>{suggestedCheck(resource)}</p>
          <small>This is guidance, not a confirmed root cause.</small>
        </details>
      )}
    </section>
  )
}
