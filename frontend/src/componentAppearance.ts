import type { LiveResource } from './useClusterSnapshot'
import { lifecycle, lifecycleLabels } from './lifecycle.ts'

export type ComponentAppearance = {
  tone: 'normal' | 'warning' | 'danger' | 'complete' | 'unknown'
  label: string
  containerImpact: boolean
}

// Shell colour describes the observed issue's component, not aggregate Pod Ready.
// Container status is evaluated independently; Pod failure never recolours its children.
export function componentAppearance(
  resource: LiveResource,
  children: LiveResource[],
  fresh: (resource: LiveResource) => boolean,
): ComponentAppearance {
  const state = lifecycle(resource, fresh(resource))
  const result: ComponentAppearance = {
    tone:
      state === 'unknown'
        ? 'unknown'
        : state === 'failed'
          ? 'danger'
          : state === 'completed'
            ? 'complete'
            : state === 'ready'
              ? 'normal'
              : 'warning',
    label: lifecycleLabels[state],
    containerImpact: false,
  }
  if (resource.kind === 'Container') {
    if (fresh(resource) && state === 'waiting' && resource.reason === 'CrashLoopBackOff')
      return { ...result, tone: 'danger', label: 'Crash loop' }
    return result
  }
  if (
    resource.kind !== 'Pod' ||
    ['unknown', 'failed', 'completed', 'deleting', 'ready'].includes(state)
  )
    return result

  const ownChildren = children.filter((c) => c.kind === 'Container' && c.parent === resource.id)
  const issues = ownChildren.filter(
    (c) => fresh(c) && ['failed', 'waiting', 'not-ready'].includes(lifecycle(c, true)),
  )
  const conditions = resource.conditions ?? []
  const containerReadiness = conditions.some(
    (c) => c.type === 'Ready' && c.status === 'False' && c.reason === 'ContainersNotReady',
  )
  const containerInitialization =
    conditions.some(
      (c) =>
        c.type === 'Initialized' && c.status === 'False' && c.reason === 'ContainersNotInitialized',
    ) && issues.some((c) => c.containerType === 'init')
  const podBlocker =
    !!resource.reason ||
    !resource.nodeName ||
    (['Unscheduled', 'Pending'].includes(resource.state) &&
      !containerInitialization &&
      !containerReadiness) ||
    conditions.some(
      (c) =>
        c.status === 'False' &&
        (['PodScheduled', 'PodReadyToStartContainers'].includes(c.type) ||
          (c.type === 'Initialized' && !containerInitialization) ||
          (c.type === 'Ready' && c.reason !== 'ContainersNotReady')),
    )
  if (issues.length > 0 && (containerReadiness || containerInitialization) && !podBlocker) {
    return { tone: 'normal', label: 'Container issue · shell normal', containerImpact: true }
  }
  return result
}
