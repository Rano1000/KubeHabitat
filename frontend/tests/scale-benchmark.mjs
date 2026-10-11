import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'
import { scaleFixture } from './scale-fixture.mjs'
import { scalableLayout, workloadGroups, containerIndex, healthSummary } from '../src/scaleModel.ts'
console.log(
  'Synthetic CPU model benchmark. This does not measure browser FPS or a production Kubernetes API.',
)
for (const count of [100, 1000, 5000]) {
  const fixture = scaleFixture(count),
    groups = workloadGroups(fixture.resources),
    children = containerIndex(fixture.resources)
  const times = []
  let layout
  for (let round = 0; round < 7; round++) {
    const start = performance.now()
    layout = scalableLayout(fixture.resources, new Set(), true, null, 0, null)
    const summaries = groups.map((g) =>
      healthSummary(g.pods, fixture.resources, () => true, children),
    )
    assert.equal(
      summaries.reduce((sum, s) => sum + s.total, 0),
      count,
    )
    if (round >= 2) times.push(performance.now() - start)
  }
  const expanded = scalableLayout(fixture.resources, new Set(), true, groups[0].id, 0, null)
  assert.ok(expanded.pods.length <= 48)
  assert.equal(layout.totalPods, count)
  assert.equal(layout.totalContainers, count * 2)
  console.log(
    JSON.stringify({
      pods: count,
      nodes: layout.rooms.length,
      groups: layout.groups.length,
      individualPodsInOverview: layout.pods.length,
      individualPodsWhenExpanded: expanded.pods.length,
      medianLayoutAndSummaryMs: Number(times.sort((a, b) => a - b)[2].toFixed(2)),
    }),
  )
}
