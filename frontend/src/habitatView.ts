import type { LiveKind, LiveResource } from './useClusterSnapshot'

export const overviewKinds: LiveKind[] = ['Node', 'Namespace', 'Pod', 'Service']
export const storageKinds: LiveKind[] = [
  'Volume',
  'PersistentVolumeClaim',
  'PersistentVolume',
  'StorageClass',
  'ResourceQuota',
]
export const networkKinds: LiveKind[] = ['EndpointSlice', 'Ingress', 'NetworkPolicy']

export function resolveReference(
  resources: LiveResource[],
  link: NonNullable<LiveResource['links']>[number],
) {
  return resources.find(
    (r) =>
      r.kind === link.kind &&
      (link.uid
        ? r.uid === link.uid || r.id === link.uid
        : r.name === link.name && (link.namespace ? r.namespace === link.namespace : !r.namespace)),
  )
}

export function podStorage(resources: LiveResource[], podId: string) {
  const attached = new Set(
    resources.filter((r) => r.kind === 'Volume' && r.parent === podId).map((r) => r.id),
  )
  const pending = [...attached]
  for (let index = 0; index < pending.length; index++) {
    const resource = resources.find((r) => r.id === pending[index])
    for (const link of resource?.links ?? []) {
      const target = resolveReference(resources, link)
      if (target && storageKinds.includes(target.kind) && !attached.has(target.id)) {
        attached.add(target.id)
        pending.push(target.id)
      }
    }
  }
  return attached
}

export function sceneObjectIds(
  resources: LiveResource[],
  layers: { network: boolean; storage: boolean; capacity: boolean },
  storagePod: string | null,
) {
  const attached = storagePod ? podStorage(resources, storagePod) : null
  return new Set(
    resources
      .filter(
        (r) =>
          r.kind === 'Service' ||
          (layers.network && networkKinds.includes(r.kind)) ||
          (layers.storage && storageKinds.includes(r.kind) && (!attached || attached.has(r.id))),
      )
      .map((r) => r.id),
  )
}

// Requests, provisioned capacity and volume limits have different Kubernetes meanings.
export function storageFacts(resources: LiveResource[], resource: LiveResource) {
  const claim =
    resource.kind === 'PersistentVolumeClaim'
      ? resource
      : (resource.links ?? [])
          .map((link) => resolveReference(resources, link))
          .find((r) => r?.kind === 'PersistentVolumeClaim')
  const parent = resources.find((r) => r.id === resource.parent)
  const details = resource.details ?? {}
  const unobservedClaim =
    resource.kind === 'Volume' &&
    !claim &&
    (details.type === 'PersistentVolumeClaim' ||
      resource.links?.some((l) => l.kind === 'PersistentVolumeClaim'))
  return {
    identity:
      resource.kind === 'Volume'
        ? `${parent?.name ?? 'Pod not observed'}/${resource.name}`
        : resource.name,
    shortId:
      resource.kind === 'Volume'
        ? `${(parent?.uid ?? resource.uid).slice(0, 8)}/${resource.name}`
        : resource.uid.slice(0, 8),
    minimum:
      claim?.details?.['requested storage'] ?? (unobservedClaim ? 'Not observed' : 'Not declared'),
    capacity: claim?.details?.['capacity storage'] ?? details['capacity storage'] ?? 'Not observed',
    maximum: details['size limit'] ?? 'Not declared',
    type: details['type'] ?? resource.kind,
    medium: details['medium'],
    claim,
  }
}
