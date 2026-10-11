// Synthetic observations for tests only; never imported by the live application.
export function scaleFixture(count, revision = 1) {
  const at = new Date().toISOString()
  const object = (kind, id, fields = {}) => ({
    kind,
    id,
    uid: id,
    name: id,
    state: 'Ready',
    ready: true,
    resourceVersion: String(revision),
    observedAt: at,
    ...fields,
  })
  const nodeCount = Math.max(1, Math.ceil(count / 100))
  const resources = Array.from({ length: nodeCount }, (_, i) =>
    object('Node', `node-${i}`, { name: `worker-${i}` }),
  )
  for (let i = 0; i < count; i++) {
    const owner = Math.floor(i / 100),
      namespace = `team-${owner % 5}`,
      nodeName = `worker-${Math.floor(i / 50) % nodeCount}`
    const id = `pod-${String(i).padStart(5, '0')}`,
      bad = i % 997 === 0
    resources.push(
      object('Pod', id, {
        namespace,
        nodeName,
        labels: { app: `application-${owner % 10}` },
        owner: { uid: `rs-${owner}`, kind: 'ReplicaSet', name: `workload-${owner}` },
        state: bad ? 'NotReady' : 'Ready',
        ready: !bad,
      }),
    )
    for (const name of ['app', 'sidecar'])
      resources.push(
        object('Container', `${id}/${name}`, {
          name,
          parent: id,
          namespace,
          nodeName,
          state: bad && name === 'app' ? 'Waiting' : 'Running',
          ready: !(bad && name === 'app'),
          reason: bad && name === 'app' ? 'CrashLoopBackOff' : undefined,
        }),
      )
  }
  return {
    schemaVersion: 1,
    sessionId: 'synthetic-scale-test',
    revision,
    generatedAt: at,
    dataSource: 'kubernetes',
    cluster: 'synthetic-test-cluster',
    connection: 'connected',
    visibility: [
      'Node',
      'Namespace',
      'Pod',
      'Service',
      'EndpointSlice',
      'Ingress',
      'NetworkPolicy',
      'PersistentVolumeClaim',
      'PersistentVolume',
      'StorageClass',
      'ResourceQuota',
    ].map((kind) => ({ kind, state: 'observing', synced: true, lastSuccess: at })),
    resources,
  }
}
