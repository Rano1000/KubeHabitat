export type ResourceKind = 'Node' | 'Namespace' | 'Pod' | 'Container'
export type ResourceState = 'Ready' | 'NotReady' | 'Active' | 'Waiting' | 'CrashLoopBackOff'
export type Resource = {
  id: string
  name: string
  kind: ResourceKind
  state: ResourceState
  namespace?: string
  node?: string
  parent?: string
  phase?: 'Running' | 'Active'
  ready?: boolean
  description: string
  position: [number, number, number]
}

// These identifiers belong to a deterministic illustration, never a real cluster.
export const resources: Resource[] = [
  {
    id: 'demo-node-a',
    name: 'worker-a',
    kind: 'Node',
    state: 'Ready',
    description:
      'A room represents a node. Pods are placed here according to their observed node assignment.',
    position: [-2.6, 0, 0],
  },
  {
    id: 'demo-node-b',
    name: 'worker-b',
    kind: 'Node',
    state: 'Ready',
    description: 'A second node room. Namespace membership can span both rooms.',
    position: [2.6, 0, 0],
  },
  {
    id: 'demo-ns-shop',
    name: 'shop',
    kind: 'Namespace',
    state: 'Active',
    phase: 'Active',
    description: 'A logical overlay across rooms, rather than a room contained inside one node.',
    position: [0, 0, 0],
  },
  {
    id: 'demo-pod-web',
    name: 'web-example',
    kind: 'Pod',
    namespace: 'shop',
    node: 'demo-node-a',
    state: 'Ready',
    phase: 'Running',
    ready: true,
    description:
      'Example Pod Ready condition is true. Floating and rotation illustrate this observed state; they are not a separate health check.',
    position: [-3.5, 1.4, 0],
  },
  {
    id: 'demo-pod-api',
    name: 'api-example',
    kind: 'Pod',
    namespace: 'shop',
    node: 'demo-node-a',
    state: 'Ready',
    phase: 'Running',
    ready: true,
    description:
      'A pod contains its containers. Running and Ready will be shown separately when Kubernetes is connected.',
    position: [-1.7, 1.4, 0],
  },
  {
    id: 'demo-pod-worker',
    name: 'worker-example',
    kind: 'Pod',
    namespace: 'shop',
    node: 'demo-node-b',
    state: 'NotReady',
    phase: 'Running',
    ready: false,
    description:
      'The inner container is waiting with CrashLoopBackOff. The pod object still exists; this does not mean a replacement pod was created.',
    position: [2.6, 1.4, 0],
  },
  {
    id: 'demo-container-web',
    name: 'web',
    kind: 'Container',
    parent: 'demo-pod-web',
    namespace: 'shop',
    node: 'demo-node-a',
    state: 'Ready',
    description:
      'The inner box represents a container in the pod API object. Containers do not have a separate Kubernetes watch endpoint.',
    position: [-3.5, 1.4, 0],
  },
  {
    id: 'demo-container-api',
    name: 'api',
    kind: 'Container',
    parent: 'demo-pod-api',
    namespace: 'shop',
    node: 'demo-node-a',
    state: 'Ready',
    description:
      'A ready example container. Real container restart counts will come from pod status in Phase 02.',
    position: [-1.7, 1.4, 0],
  },
  {
    id: 'demo-container-worker',
    name: 'worker',
    kind: 'Container',
    parent: 'demo-pod-worker',
    namespace: 'shop',
    node: 'demo-node-b',
    state: 'CrashLoopBackOff',
    description:
      'A stopped amber box marks a container restart loop. A restart affects this container, not the pod identity.',
    position: [2.6, 1.4, 0],
  },
]

export const kinds: ResourceKind[] = ['Node', 'Namespace', 'Pod', 'Container']
export const pods = resources.filter((resource) => resource.kind === 'Pod')
export function isWarning(resource: Resource): boolean {
  return (
    resource.state === 'NotReady' ||
    resource.state === 'CrashLoopBackOff' ||
    resource.state === 'Waiting'
  )
}
export function highlightedIds(kind: ResourceKind | 'All', selected: string | null): Set<string> {
  const matches = resources.filter((resource) =>
    selected ? resource.id === selected : kind === 'All' || resource.kind === kind,
  )
  return new Set(
    matches.flatMap((resource) =>
      resource.kind === 'Container'
        ? [resource.id, resource.parent!]
        : resource.kind === 'Namespace'
          ? resources.filter((item) => item.namespace === resource.name).map((item) => item.id)
          : [resource.id],
    ),
  )
}
