import type {
  LiveResource,
  PolicyPeer,
  PolicyPort,
  PolicyRule,
  Selector,
} from './useClusterSnapshot'

type Verdict = 'Allowed by policy' | 'Denied by policy' | 'Unknown'
type Tri = boolean | null
const any = (values: Tri[]): Tri =>
  values.includes(true) ? true : values.includes(null) ? null : false
const both = (a: Tri, b: Tri): Tri =>
  a === false || b === false ? false : a === null || b === null ? null : true

export function matches(selector: Selector, labels: Record<string, string> = {}): Tri {
  if (!selector || typeof selector !== 'object') return null
  if (!Object.entries(selector.matchLabels ?? {}).every(([k, v]) => labels[k] === v)) return false
  for (const expression of selector.matchExpressions ?? []) {
    const exists = Object.hasOwn(labels, expression.key)
    switch (expression.operator) {
      case 'In':
        if (!exists || !expression.values?.includes(labels[expression.key])) return false
        break
      case 'NotIn':
        if (exists && expression.values?.includes(labels[expression.key])) return false
        break
      case 'Exists':
        if (!exists) return false
        break
      case 'DoesNotExist':
        if (exists) return false
        break
      default:
        return null
    }
  }
  return true
}

export function policyCheck(
  resources: LiveResource[],
  source: LiveResource,
  destination: LiveResource,
  port: number,
  protocol: string,
  complete: boolean,
): { verdict: Verdict; explanation: string } {
  if (!complete)
    return {
      verdict: 'Unknown',
      explanation: 'Fresh Pod, Namespace and NetworkPolicy observations are required.',
    }
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return { verdict: 'Unknown', explanation: 'Select a valid destination port.' }
  if (source.id === destination.id)
    return {
      verdict: 'Unknown',
      explanation: 'Select two different pods. Same-pod networking is not evaluated here.',
    }
  const policies = resources.filter((r) => r.kind === 'NetworkPolicy')
  const peerMatches = (peer: PolicyPeer, other: LiveResource, policyNamespace: string): Tri => {
    if (peer.ipBlock) return null // No IP/CIDR inference from incomplete or NAT-dependent addresses.
    let namespace: Tri = true
    if (peer.namespaceSelector) {
      const ns = resources.find((r) => r.kind === 'Namespace' && r.name === other.namespace)
      namespace = ns ? matches(peer.namespaceSelector, ns.labels) : null
    } else if (peer.podSelector) namespace = other.namespace === policyNamespace
    return both(namespace, peer.podSelector ? matches(peer.podSelector, other.labels) : true)
  }
  const portMatches = (entry: PolicyPort): Tri => {
    if ((entry.protocol ?? 'TCP') !== protocol) return false
    if (entry.port === undefined) return true
    if (typeof entry.port === 'number')
      return port >= entry.port && port <= (entry.endPort ?? entry.port)
    const children = resources.filter((r) => r.kind === 'Container' && r.parent === destination.id)
    const found = children.flatMap((r) =>
      Object.entries(r.details ?? {})
        .filter(([key]) => key === `port ${entry.port}`)
        .map(([, value]) => value),
    )
    return found.length ? found.includes(`${protocol}/${port}`) : null
  }
  const direction = (pod: LiveResource, other: LiveResource, type: 'Ingress' | 'Egress'): Tri => {
    const candidates = policies.filter(
      (r) =>
        r.namespace === pod.namespace &&
        matches(r.policy?.podSelector ?? {}, pod.labels) !== false &&
        (
          r.policy?.policyTypes ?? ['Ingress', ...(r.policy?.egress?.length ? ['Egress'] : [])]
        ).includes(type),
    )
    if (!candidates.length) return true
    return any(
      candidates.map((r) => {
        if (!r.policy || matches(r.policy.podSelector, pod.labels) === null) return null
        const rules = type === 'Ingress' ? r.policy.ingress : r.policy.egress
        return any(
          (rules ?? []).map((rule: PolicyRule) => {
            const peers = type === 'Ingress' ? rule.from : rule.to
            return both(
              !peers?.length
                ? true
                : any(peers.map((p) => peerMatches(p, other, r.namespace ?? ''))),
              !rule.ports?.length ? true : any(rule.ports.map(portMatches)),
            )
          }),
        )
      }),
    )
  }
  const allowed = both(
    direction(source, destination, 'Egress'),
    direction(destination, source, 'Ingress'),
  )
  return {
    verdict:
      allowed === true ? 'Allowed by policy' : allowed === false ? 'Denied by policy' : 'Unknown',
    explanation:
      allowed === null
        ? 'A rule requires IP/CIDR or unavailable named-port information.'
        : 'Declared Kubernetes NetworkPolicy result for this direction and port. CNI enforcement, routing, listeners, firewalls and live traffic are not verified.',
  }
}
