import type { LiveResource } from './useClusterSnapshot'

export type Lifecycle =
  'ready' | 'waiting' | 'not-ready' | 'failed' | 'completed' | 'deleting' | 'unknown'
export function lifecycle(resource: LiveResource, fresh: boolean): Lifecycle {
  if (!fresh || resource.state === 'Unknown') return 'unknown'
  if (resource.deleting || resource.state === 'Terminating') return 'deleting'
  if (resource.state === 'Failed') return 'failed'
  if (['Completed', 'Succeeded'].includes(resource.state)) return 'completed'
  if (resource.state === 'Terminated') {
    const code = resource.termination?.exitCode ?? resource.exitCode
    return code === undefined ? 'unknown' : code === 0 ? 'completed' : 'failed'
  }
  if (['Waiting', 'Pending', 'Unscheduled'].includes(resource.state)) return 'waiting'
  if (resource.ready === false || resource.state === 'NotReady') return 'not-ready'
  return resource.ready === true ? 'ready' : 'unknown'
}

export function needsInvestigation(resource: LiveResource, fresh: boolean) {
  return ['unknown', 'waiting', 'not-ready', 'failed', 'deleting'].includes(
    lifecycle(resource, fresh),
  )
}

export const lifecycleLabels: Record<Lifecycle, string> = {
  ready: 'Ready',
  waiting: 'Waiting',
  'not-ready': 'Not ready',
  failed: 'Failed',
  completed: 'Completed',
  deleting: 'Deletion requested',
  unknown: 'Unknown',
}
export const lifecycleMarks: Record<Lifecycle, string> = {
  ready: '●',
  waiting: '…',
  'not-ready': '!',
  failed: '×',
  completed: '✓',
  deleting: '↓',
  unknown: '?',
}

// Explanations use projected status only. Suggested checks are never asserted as causes.
export function lifecycleExplanation(resource: LiveResource, fresh: boolean) {
  const state = lifecycle(resource, fresh)
  if (!fresh)
    return 'Current health is unknown. The inspector retains the last observation until Kubernetes visibility recovers.'
  if (state === 'deleting')
    return 'Kubernetes has recorded a deletion request. Deletion does not prove that this workload crashed.'
  if (state === 'completed')
    return resource.kind === 'Pod'
      ? 'Kubernetes reports successful pod completion. A finished task is not a failed pod.'
      : 'This container exited with code 0. A completed init container can be normal while its application keeps running.'
  if (state === 'failed')
    return resource.kind === 'Pod'
      ? 'Kubernetes reports a failed pod. The floor fragments mark this observed failed identity; they do not imply a replacement.'
      : `This container terminated with exit code ${resource.termination?.exitCode ?? resource.exitCode}. The pod keeps its identity unless Kubernetes creates a new UID.`
  if (resource.reason === 'CrashLoopBackOff')
    return 'Kubernetes is delaying another container restart after repeated exits. This describes retry behaviour; the underlying cause needs termination evidence and investigation.'
  if (state === 'waiting')
    return 'This workload is waiting to start or be scheduled. Waiting alone does not identify a failure cause.'
  if (state === 'not-ready')
    return 'The ready signal is false. Running and ready are different: a started process may still be unable to serve requests.'
  if (state === 'ready')
    return 'Kubernetes reports readiness. Floating pod motion represents that signal, not a guarantee of application correctness.'
  return 'There is not enough current status evidence for a health verdict. Unknown is distinct from failed and completed.'
}

export function suggestedCheck(resource: LiveResource) {
  const reason = resource.reason ?? resource.termination?.reason ?? resource.lastTermination?.reason
  if (reason === 'OOMKilled')
    return 'Compare memory usage with requests and limits, then inspect the process behaviour. OOMKilled alone does not establish a memory leak.'
  if (['ImagePullBackOff', 'ErrImagePull'].includes(reason ?? ''))
    return 'Check the image reference, registry reachability and pull permissions. Secret contents are not available here.'
  if (reason === 'CrashLoopBackOff')
    return 'Inspect the previous termination, then retrieve previous logs in the investigation panel and review probe configuration.'
  return 'Review the observed conditions and container states, then open the investigation panel for reported events and available logs.'
}
