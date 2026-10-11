import { useState } from 'react'
import type { LiveResource } from './useClusterSnapshot'
import { podActions, podCommands, podGuidance } from './podTroubleshooting'
import type { PodAction } from './podTroubleshooting'

export function PodWorkbench({
  pod,
  containers,
  action,
  fresh,
  onContainer,
}: {
  pod: LiveResource
  containers: LiveResource[]
  action: PodAction
  fresh: (r: LiveResource) => boolean
  onContainer: (id: string) => void
}) {
  const [copyStatus, setCopyStatus] = useState('')
  const commands = podCommands(pod, containers, action)
  return (
    <section className="pod-workbench" aria-label="Pod action workspace">
      <span className="eyebrow">SELECTED POD / {pod.namespace}</span>
      <h4>{podActions.find((a) => a.id === action)?.label}</h4>
      {action === 'logs' && (
        <>
          <p>
            Choose the container, then load its current or previous logs. Each has separate
            evidence.
          </p>
          <div className="pod-container-choices">
            {containers.map((c) => (
              <button className="subtle-button" key={c.id} onClick={() => onContainer(c.id)}>
                Inspect logs: {c.name}
              </button>
            ))}
          </div>
          {!containers.length && (
            <p>No containers observed for this pod. Check discovery visibility.</p>
          )}
        </>
      )}
      {action === 'troubleshoot' &&
        [pod, ...containers].map((r) => {
          const guide = podGuidance(r, fresh(r))
          return (
            <article className="pod-diagnostic" key={r.id}>
              <strong>
                {r.kind}: {r.name}
              </strong>
              <p>
                <b>Observed status:</b> {fresh(r) ? r.state : 'Unknown freshness'}
                {fresh(r) && r.reason ? ` · ${r.reason}` : ''}
              </p>
              <p>{guide.observation}</p>
              <p>
                <b>Suggested checks:</b> {guide.check}
              </p>
            </article>
          )
        })}
      {action === 'memory' && (
        <p>
          Inspect the CPU and memory layer and resource details below. Requests and limits are
          configuration; measured usage is shown only when available. High usage alone does not
          establish a leak.
        </p>
      )}
      {action === 'memory' &&
        containers.map((container) => (
          <article className="pod-diagnostic" key={container.id}>
            <strong>{container.name}</strong>
            <p>
              {!fresh(container)
                ? 'Retained observation; current usage is unknown.'
                : container.usage
                  ? `Measured memory: ${(container.usage.memoryBytes / 1048576).toFixed(1)} MiB · CPU: ${container.usage.cpuMilli} mCPU · sample ${container.usage.timestamp}`
                  : 'Measured container usage unavailable.'}
            </p>
            <dl>
              {Object.entries(container.details ?? {})
                .filter(([key]) => /cpu|memory/.test(key))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            <button className="text-link" onClick={() => onContainer(container.id)}>
              Inspect container: {container.name}
            </button>
          </article>
        ))}
      {action === 'network' && (
        <p>
          Inspect this pod’s Services below. The network layer lets you choose a destination and
          examine declared policies. A policy verdict does not prove traffic succeeded or failed.
        </p>
      )}
      {action === 'storage' && (
        <p>
          The storage layer highlights this pod’s existing attachments. Claims, capacity and mounts
          are listed below; missing measurements stay unknown.
        </p>
      )}
      {action === 'details' && (
        <p>
          Identity, placement, containers, Services and existing storage attachments are listed
          below.
        </p>
      )}
      {action !== 'events' && (
        <details className="pod-command-list" open={action === 'troubleshoot'}>
          <summary>Read-only troubleshooting commands</summary>
          <p className="scope-note">
            Replace &lt;YOUR_CONTEXT&gt; with your intended kubectl context. These commands use
            namespace and pod name; verify the UID with the inspector if the pod was replaced.
            Nothing runs automatically.
          </p>
          {commands.map((command) => (
            <div key={command.text}>
              <small>{command.label}</small>
              <pre tabIndex={0}>
                <code>{command.text}</code>
              </pre>
              <button
                className="subtle-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(command.text)
                    setCopyStatus('Command copied. Replace the context before running it.')
                  } catch {
                    setCopyStatus('Clipboard unavailable. Select and copy the command text.')
                  }
                }}
              >
                Copy command
              </button>
            </div>
          ))}
          {!commands.length && (
            <p>Commands unavailable: a valid pod name and namespace are required.</p>
          )}
          <p role="status">{copyStatus}</p>
        </details>
      )}
      <p className="scope-note">
        Guidance uses reported status, not an automatic diagnosis of log text. Confirm possible
        causes against events and container logs.
      </p>
    </section>
  )
}
