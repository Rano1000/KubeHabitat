import type { LiveResource } from './useClusterSnapshot'
import { lifecycleExplanation, needsInvestigation, suggestedCheck } from './lifecycle.ts'

export type PodAction =
  'details' | 'logs' | 'events' | 'troubleshoot' | 'memory' | 'network' | 'storage'
export const podActions: { id: PodAction; label: string }[] = [
  { id: 'details', label: 'Pod details' },
  { id: 'logs', label: 'Container logs' },
  { id: 'events', label: 'Reported events' },
  { id: 'troubleshoot', label: 'Troubleshooting guide' },
  { id: 'memory', label: 'CPU & memory' },
  { id: 'network', label: 'Network relationships' },
  { id: 'storage', label: 'Storage attachments' },
]

// Only Kubernetes DNS names are interpolated. These quoted values work in Bash and PowerShell.
const name = (value?: string) =>
  !!value && value.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)
export function podCommands(pod: LiveResource, containers: LiveResource[], action: PodAction) {
  if (pod.kind !== 'Pod' || !name(pod.name) || !name(pod.namespace)) return []
  const cli = `kubectl --context '<YOUR_CONTEXT>' --namespace '${pod.namespace}'`
  const commands = [
    { label: 'Inspect the pod and reported events', text: `${cli} describe pod '${pod.name}'` },
  ]
  if (action === 'memory')
    commands.push({
      label: 'Measured usage (requires Metrics Server)',
      text: `${cli} top pod '${pod.name}' --containers`,
    })
  if (action === 'network') {
    commands.push({
      label: 'Services and declared destinations in this namespace',
      text: `${cli} get services,endpointslices -o wide`,
    })
    commands.push({
      label: 'Declared network policies (not a connectivity test)',
      text: `${cli} get networkpolicies`,
    })
  }
  if (action === 'storage')
    commands.push({
      label: 'Claims in this namespace (attachments are listed below)',
      text: `${cli} get persistentvolumeclaims`,
    })
  if (action === 'troubleshoot' || action === 'logs') {
    for (const container of containers) {
      if (
        container.parent !== pod.id ||
        container.namespace !== pod.namespace ||
        !name(container.name)
      )
        continue
      const log = `${cli} logs '${pod.name}' --container '${container.name}' --tail=200 --since=15m --timestamps`
      commands.push({ label: `${container.name}: current run`, text: log })
      if (container.restartCount || container.lastTermination)
        commands.push({
          label: `${container.name}: previous run, if retained`,
          text: `${log} --previous`,
        })
    }
  }
  return commands
}

export function podNeedsInspection(
  pod: LiveResource,
  containers: LiveResource[],
  fresh: (r: LiveResource) => boolean,
) {
  return (
    needsInvestigation(pod, fresh(pod)) ||
    containers.some((c) => c.parent === pod.id && needsInvestigation(c, fresh(c)))
  )
}

export function podGuidance(resource: LiveResource, fresh: boolean) {
  return {
    observation: lifecycleExplanation(resource, fresh),
    check: fresh
      ? suggestedCheck(resource)
      : 'Restore observation freshness before drawing conclusions about the current workload.',
  }
}
