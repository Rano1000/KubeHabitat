import progressiveExploration from '../../docs/assets/progressive-exploration.svg'
import themeHabitats from '../../docs/assets/theme-habitats.svg'
import modernHabitats from '../../docs/assets/modern-habitats.svg'
import lifecycleEvidence from '../../docs/assets/lifecycle-evidence.svg'
import componentSignals from '../../docs/assets/component-signals.svg'
import investigationFlow from '../../docs/assets/investigation-flow.svg'
import podActions from '../../docs/assets/pod-actions.svg'
import metricsOwnership from '../../docs/assets/metrics-ownership.svg'

const phases = [
  [
    '00',
    'Vision & branding',
    'Agreed',
    'Define the cluster-house metaphor and approve the first visual identity.',
  ],
  [
    '01',
    'Foundation',
    'Verified',
    'Runnable shell, API status, contributor guides, build checks, and this demo.',
  ],
  [
    '02',
    'Kubernetes connection',
    'In review',
    'Read-only informers, stable object identities, freshness, and recovery.',
  ],
  [
    '03',
    'Spatial navigation',
    'In review',
    'Generate rooms from nodes and guide selection through the real cluster.',
  ],
  [
    '04',
    'Workload lifecycle',
    'In review',
    'Distinct lifecycle signals, current and previous termination evidence, and observed container restarts. Recorded replacement history remains open.',
  ],
  [
    '05',
    'Investigation',
    'In review',
    'On-demand UID-scoped events and bounded current/previous container logs. Retention and permissions are explicit.',
  ],
  [
    '06',
    'Metrics & dependencies',
    'In review',
    'Timestamped CPU and memory samples, bounded inspector trends and observed UID-based workload ownership. Real-provider validation remains open.',
  ],
  [
    '07',
    'Observed traffic',
    'Planned',
    'Integrate optional traffic telemetry; separate zero traffic from missing data.',
  ],
  [
    '08',
    'History & scale',
    'In review',
    'Grouped workloads, replica pages, application scopes, saved views and observed browser activity. Production scale and durable replay remain open.',
  ],
  [
    '09',
    'Release & deployment',
    'Planned',
    'Ship images, Helm, authentication, deployment guides, and a public release.',
  ],
]

export function Docs() {
  return (
    <main className="docs-page" id="main-content">
      <div className="docs-heading">
        <span className="eyebrow">THE FIELD GUIDE · LIVE DISCOVERY</span>
        <h1>Understand the habitat.</h1>
        <p>
          A contributor’s introduction to the world we’re building, the evidence behind it, and the
          steps that bring it to life.
        </p>
      </div>
      <div className="docs-grid">
        <section className="doc-card wide">
          <span className="eyebrow">METRICS / OWNERSHIP</span>
          <h2>Follow the workload. Read the evidence.</h2>
          <img
            src={metricsOwnership}
            alt="Container, pod, ReplicaSet and Deployment linked by observed identities, with CPU and memory sample evidence kept separate from configuration."
            style={{ width: '100%' }}
          />
          <p>
            Open a pod or container to follow its exact controlling owner. Each available ancestor
            is clickable; missing owners stay explicit. Search the inventory for Deployments,
            StatefulSets, DaemonSets, Jobs or CronJobs.
          </p>
          <p>
            CPU and memory measurements include timestamps and the CPU averaging window. A small
            trend collects samples while the inspector is open. Gaps break the line, unknown usage
            stays unknown, and requests, limits and capacity remain separate from consumption. This
            is live evidence, not durable replay.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">POD ACTIONS / FOCUS THEN INSPECT</span>
          <h2>Start with the pod.</h2>
          <img
            src={podActions}
            alt="Focus an exact pod, open its actions, choose a container for evidence, and review manual troubleshooting commands."
            style={{ width: '100%' }}
          />
          <p>
            Open Pods needing inspection to focus an affected pod. Right-click its scene object or
            inventory row, press Shift+F10 on the row, or use Pod actions in the inspector.
          </p>
          <p>
            Choose details, reported events, container logs, troubleshooting, memory, networking or
            storage. Logs require an explicit container and a current or previous run request.
            Suggestions explain reported status; commands are copied and run manually after
            reviewing the context.
          </p>
          <a className="text-link" href="#habitat">
            Explore pod actions →
          </a>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">INVESTIGATION / PHASE 05</span>
          <h2>Follow the alert to its evidence.</h2>
          <img
            src={investigationFlow}
            alt="Select the affected component, inspect events for its exact UID, then request a bounded current or previous container log snapshot."
            style={{ width: '100%' }}
          />
          <p>
            Select a component and open Investigate component. Events show reported reasons, counts
            and time for the exact object identity. Container selections share their parent pod’s
            events, with field paths when reported.
          </p>
          <p>
            Choose a specific container to load current or previous logs. Reads are on request,
            limited to 200 lines from the last 15 minutes and 64 KiB. Enable backend log access with
            -allow-logs and namespace-scoped pods/log permission. Missing or rotated evidence stays
            explicit.
          </p>
          <p>
            These are evidence snapshots. Refresh for new observations. Suggested checks are
            guidance; no automatic root cause is asserted.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">COMPONENT ALERTS / POD AND CONTAINER</span>
          <h2>Find the affected component.</h2>
          <img
            src={componentSignals}
            alt="A container-only issue colours the affected box inside a normal pod shell. A pod-level issue colours the shell while containers keep their own colours."
            style={{ width: '100%' }}
          />
          <p>
            A failed exit or active crash loop makes that container red. Other waiting and readiness
            issues make it yellow. A pod-level failure makes the shell red; scheduling and sandbox
            startup issues make it yellow. Each container keeps its own observed state.
          </p>
          <p>
            With confirmed container-only readiness or initialization issues, the shell stays
            normal. This does not mean Pod Ready is true: inspect the readiness evidence, and
            floating motion pauses while Pod Ready is false. Missing evidence stays unknown.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">LIFECYCLE / EVIDENCE FIRST</span>
          <h2>See the signal. Inspect the facts.</h2>
          <img
            src={lifecycleEvidence}
            alt="Ready, waiting, completed and failed workloads have distinct symbols; each links to Kubernetes status evidence."
            style={{ width: '100%' }}
          />
          <p>
            Click a pod or container to inspect its current status, previous termination, exit code
            and observation time. A restart keeps the same pod identity. Successful completion is
            not a crash. Connection gaps stay unknown.
          </p>
          <p>
            Floor fragments mark a currently observed failed pod. The last 20 browser activity
            entries include container state and restart changes. Events and logs are available on
            request in the investigation panel; durable incident replay remains planned.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">SIX VISUAL WORLDS / ONE LIVE CLUSTER</span>
          <h2>Choose your habitat.</h2>
          <img
            src={themeHabitats}
            alt="Midnight's glowing house, Garden's glass conservatory and Blueprint's modular drafting studio"
            style={{ width: '100%' }}
          />
          <p>
            Use the Theme dropdown to choose Midnight, Garden, Blueprint, Pearl, Aurora or Slate.
            Panels, icons, cluster frames, pods, containers and Service guides change together. Your
            selection and live Kubernetes observations stay intact.
          </p>
          <p>
            The theme is remembered on this browser. Reduced motion, full-screen monitoring and
            freshness rules work in all six themes.
          </p>
          <img
            src={modernHabitats}
            alt="Pearl's airy glass capsules, Aurora's orbital pods and Slate's satin enclosures"
            style={{ width: '100%' }}
          />
          <div className="theme-gallery">
            <article>
              <h3>Pearl Habitat</h3>
              <p>
                Bright porcelain surfaces, glass capsules and an open pavilion. Gentle movement and
                a quiet blue accent.
              </p>
            </article>
            <article>
              <h3>Aurora Habitat</h3>
              <p>
                Indigo glass, soft orbital collars and playful astronaut Service guides. Colourful
                without obscuring health signals.
              </p>
            </article>
            <article>
              <h3>Slate Habitat</h3>
              <p>
                Charcoal surfaces, satin modules and tailored guides. Restrained movement for a
                focused monitoring session.
              </p>
            </article>
          </div>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">PROGRESSIVE EXPLORATION / SCALE REVIEW</span>
          <h2>A clear overview. Detail when you need it.</h2>
          <img
            src={progressiveExploration}
            alt="Cluster overview, workload groups, replica pages and individual pod inspection. Warnings remain visible at every level."
            style={{ width: '100%' }}
          />
          <p>
            Large habitats automatically group workloads above 80 pods. Open a group to inspect 48
            real pods per page, use application labels to narrow your view, and jump directly to
            investigation targets. Unknown observations remain unknown.
          </p>
          <p>
            Try Grouped workloads in the scene controls. Node maps, searchable labels, saved browser
            views and observed session activity help you keep your place.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">LIVE CONNECTION / PHASE 02</span>
          <h2>Connect a read-only context.</h2>
          <p>
            Start the backend with live discovery enabled. Credentials stay server-side. The live
            inventory shows permissions, synchronization and freshness for each supported kind.
          </p>
          <pre>
            <code>
              {
                'cd backend\ngo run ./cmd/kubehabitat -live -context YOUR_READ_ONLY_CONTEXT\n\n# Open the app, then select Live cluster'
              }
            </code>
          </pre>
          <a href="#live" className="primary-link">
            Open the live inventory →
          </a>
          <p>
            Habitat and Live cluster share the real house. Demo examples is separate. Services,
            storage and resource configuration are now visible; measured usage requires Metrics API
            observations. Actual traffic telemetry remains planned.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">01 / THE MENTAL MODEL</span>
          <h2>One cluster. A house of moving parts.</h2>
          <div
            className="model-diagram"
            aria-label="Cluster contains nodes; nodes host pods; pods contain containers. Namespaces span nodes."
          >
            <div className="model-house">
              <span>CLUSTER / HOUSE</span>
              <div className="model-rooms">
                {['Node A', 'Node B'].map((node) => (
                  <div className="model-room" key={node}>
                    <strong>{node}</strong>
                    <div className="model-pod">
                      <span>Pod</span>
                      <div className="model-container">Container</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="namespace-band">Namespace overlay · spans both rooms</div>
            </div>
          </div>
          <p>
            Pods live in their assigned node room. Namespaces are logical overlays across the
            cluster. Unscheduled pods will have a waiting area.
          </p>
        </section>
        <section className="doc-card">
          <span className="eyebrow">02 / GET STARTED</span>
          <h2>Run your habitat.</h2>
          <p>
            Use Node.js 22.12+ and Go 1.27+. Start the backend and frontend in separate terminals.
          </p>
          <pre>
            <code>
              {
                'cd backend\ngo run ./cmd/kubehabitat\n\n# Separate terminal, from repo root\ncd frontend\nnpm ci\nnpm run dev'
              }
            </code>
          </pre>
          <p>
            The API listens on <code>127.0.0.1:8080</code>. Vite forwards API requests from{' '}
            <code>127.0.0.1:5173</code>.
          </p>
        </section>
        <section className="doc-card">
          <span className="eyebrow">03 / READ THE SIGNALS</span>
          <h2>Motion needs meaning.</h2>
          <ul className="signal-list">
            <li>
              <span className="signal-dot ready" />
              <div>
                <strong>Floating pod</strong>
                <p>Fresh Pod Ready evidence enables float and rotation in the live scene.</p>
              </div>
            </li>
            <li>
              <span className="signal-dot warning" />
              <div>
                <strong>Amber container</strong>
                <p>Observed waiting or readiness issues inside an existing pod.</p>
              </div>
            </li>
            <li>
              <span className="signal-dot unknown" />
              <div>
                <strong>Unknown or stale</strong>
                <p>Missing observations must never be presented as confirmed failure.</p>
              </div>
            </li>
          </ul>
          <p>
            Habitat uses real observations. Unknown freshness pauses healthy motion. Network lines
            show configuration; policy colors do not certify reachability. Filesystem usage, traffic
            telemetry, durable failure history and automatic diagnosis are not implemented.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">04 / HOW DATA TRAVELS</span>
          <h2>Observed state becomes a visual story.</h2>
          <div className="flow-diagram">
            {[
              'Kubernetes API',
              'Read-only Go cache',
              'Full snapshots',
              'House + inventory + details',
            ].map((label, index) => (
              <div className="flow-step" key={label}>
                <small>0{index + 1}</small>
                <strong>{label}</strong>
                <span>
                  {index === 0
                    ? 'Workloads, network & storage'
                    : index === 1
                      ? 'UIDs & freshness'
                      : index === 2
                        ? 'Poll · retry · resynchronize'
                        : 'Evidence you can inspect'}
                </span>
              </div>
            ))}
          </div>
          <p>
            One snapshot drives counts, rooms, pods, containers and inspector. Storage and network
            references come from observed objects. Credentials stay on the backend; containers and
            pod volumes derive from pods.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">05 / THE ROAD AHEAD</span>
          <h2>Build it phase by phase.</h2>
          <div className="phase-grid">
            {phases.map(([number, name, state, description]) => (
              <article key={number} className={`phase-card ${number === '03' ? 'current' : ''}`}>
                <span className="phase-number">{number}</span>
                <div>
                  <h3>{name}</h3>
                  <small>{state}</small>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
          <p>
            Progress is backed by acceptance criteria and verification. Phase 01 passed local checks
            and GitHub CI. Development changes go directly to main until release.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">06 / MAKE A CONTRIBUTION</span>
          <h2>Help make Kubernetes visible.</h2>
          <p>
            Read the contributor guide and use issues to report bugs or propose ideas. Maintainer
            development goes directly to main before release. Pull requests will open after the
            first public release.
          </p>
          <a
            className="text-link"
            href="https://github.com/Rano1000/KubeHabitat/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noreferrer"
          >
            Read the contributor guide ↗
          </a>
          <span className="link-note">Read the source guide on main.</span>
        </section>
      </div>
    </main>
  )
}
