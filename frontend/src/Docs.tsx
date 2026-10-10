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
    'In review',
    'Runnable shell, API status, contributor guides, build checks, and this demo.',
  ],
  [
    '02',
    'Kubernetes connection',
    'Planned',
    'Read-only informers, stable object identities, freshness, and recovery.',
  ],
  [
    '03',
    'Spatial navigation',
    'Planned',
    'Generate rooms from nodes and guide selection through the real cluster.',
  ],
  [
    '04',
    'Workload lifecycle',
    'Planned',
    'Animate readiness, container restarts, pod replacement, and completion accurately.',
  ],
  [
    '05',
    'Investigation',
    'Planned',
    'Connect visual symptoms to conditions, events, and available logs.',
  ],
  [
    '06',
    'Metrics & dependencies',
    'Planned',
    'Explain CPU, memory, workload ownership, services, and persistent storage.',
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
    'Planned',
    'Replay recorded activity, handle large clusters, and improve accessibility.',
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
        <span className="eyebrow">THE FIELD GUIDE · PHASE 01</span>
        <h1>Understand the habitat.</h1>
        <p>
          A contributor’s introduction to the world we’re building, the evidence behind it, and the
          steps that bring it to life.
        </p>
      </div>
      <div className="docs-grid">
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
          <h2>Run the foundation.</h2>
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
                <p>Illustrates an observed Ready condition in this demo.</p>
              </div>
            </li>
            <li>
              <span className="signal-dot warning" />
              <div>
                <strong>Amber container</strong>
                <p>Example restart loop inside an existing pod.</p>
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
            Phase 01 has no cluster connection, telemetry, failure history, or automatic diagnosis.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">04 / HOW DATA WILL TRAVEL</span>
          <h2>Observed state becomes a visual story.</h2>
          <div className="flow-diagram">
            {[
              'Kubernetes API',
              'Read-only Go cache',
              'Snapshot + updates',
              '3D scene + details',
            ].map((label, index) => (
              <div className="flow-step" key={label}>
                <small>0{index + 1}</small>
                <strong>{label}</strong>
                <span>
                  {index === 0
                    ? 'Conditions & events'
                    : index === 1
                      ? 'UIDs & freshness'
                      : index === 2
                        ? 'Planned in Phase 02'
                        : 'Evidence you can inspect'}
                </span>
              </div>
            ))}
          </div>
          <p>
            This is the target architecture. The current backend exposes health and disconnected
            status only.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">05 / THE ROAD AHEAD</span>
          <h2>Build it phase by phase.</h2>
          <div className="phase-grid">
            {phases.map(([number, name, state, description]) => (
              <article key={number} className={`phase-card ${number === '01' ? 'current' : ''}`}>
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
            Progress is backed by acceptance criteria and verification. Phase 01 is awaiting review
            until its review and checks are complete.
          </p>
        </section>
        <section className="doc-card wide">
          <span className="eyebrow">06 / MAKE A CONTRIBUTION</span>
          <h2>Help make Kubernetes visible.</h2>
          <p>
            Start with the contributor guide, choose a focused issue, and explain both the behavior
            and its evidence. Contributions in code, Kubernetes modeling, documentation,
            accessibility, and visual design are welcome.
          </p>
          <a
            className="text-link"
            href="https://github.com/Rano1000/KubeHabitat/blob/phase-01-foundation/CONTRIBUTING.md"
            target="_blank"
            rel="noreferrer"
          >
            Read the contributor guide ↗
          </a>
          <span className="link-note">Read the source guide on the foundation branch.</span>
        </section>
      </div>
    </main>
  )
}
