// KPI deck, Pipeline, Insights, Flow scenes.
const { useState: useSc, useEffect: useEc, useRef: useRc, useMemo: useMc } = React;

// ============= KPI Deck =============
function KPIDeck() {
  return (
    <section className="scene" id="metrics">
      <div className="scene-header">
        <div className="left">
          <span className="t-eyebrow">Lab pulse · live</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>What's moving today.</h2>
          <p className="t-body" style={{ marginTop: 10 }}>Four signals we watch every morning. Hover any number for what it means.</p>
        </div>
        <div className="t-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warm-600)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
          updated 2 min ago · auto every 60 s
        </div>
      </div>

      <div className="kpi-grid stagger-children">
        {window.ESD2_KPIS.map((k, i) => (
          <Reveal key={k.id} delay={i * 80}>
            <GlassCard className={`kpi ${k.tint || ''}`} data-cursor="hover" data-insight={`kpi-${k.id}`}>
              <div className="kpi-top">
                <span className="t-eyebrow label">
                  {k.gloss ? <Gloss term={k.gloss}>{k.label}</Gloss> : k.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkline values={k.spark} w={60} h={22} />
                  <Tooltip term={k.gloss}>
                    <span className="kpi-info" tabIndex={0}>i</span>
                  </Tooltip>
                </div>
              </div>
              <div className="kpi-value">
                {k.id === 'epochs' ? (
                  <Counter to={k.value} formatter={v => Math.round(v).toLocaleString()} />
                ) : k.id === 'auroc' ? (
                  <Counter to={k.value} decimals={3} />
                ) : (
                  <Counter to={k.value} decimals={k.id === 'rmssd' || k.id === 'redcap' ? 1 : 0} />
                )}
                <small>{k.unit}</small>
              </div>
              <div className="kpi-sub">{k.sub}</div>
              <div className="kpi-foot">
                <span className="kpi-delta"><Icon name="trending-up" size={11} /> {k.delta}</span>
              </div>
            </GlassCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ============= Pipeline =============
function PipelineScene() {
  const stages = window.ESD2_STAGES;
  const [hovered, setHovered] = useSc(null);

  const W = 1380, H = 340;
  const padX = 60;
  const colW = (W - padX * 2) / (stages.length - 1);
  const cy = 175;

  const nodes = useMc(() => stages.map((s, i) => ({ ...s, x: padX + i * colW, y: cy })), [colW]);

  const curve = (a, b) => `M ${a.x + 38} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x - 38} ${b.y}`;

  const hoveredStage = nodes.find(n => n.id === hovered);

  return (
    <section className="scene" id="pipeline">
      <div className="scene-header">
        <div className="left">
          <span className="t-eyebrow">From device to discovery</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>The <Gloss term="NANO">NANO</Gloss> pipeline, live.</h2>
          <p className="t-body" style={{ marginTop: 10 }}>
            Six stages between an <Gloss term="Actiheart">Actiheart-5</Gloss> heartbeat and a de-identified row in our analysis parquet. Hover any node — it'll tell you what happens there.
          </p>
        </div>
        <Magnetic strength={0.2}>
          <button className="nav-cta" data-cursor="hover" style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid rgba(0,0,0,0.12)' }}>
            <Icon name="git-branch" size={13} /> Open pipeline.yaml
          </button>
        </Magnetic>
      </div>

      <Reveal>
        <GlassCard className="pipeline" style={{ overflow: 'visible' }} data-insight="pipeline-svg">
          <svg className="pipeline-svg" viewBox={`0 0 ${W} ${H}`}>
            <defs>
              <radialGradient id="particle-grad">
                <stop offset="0%" stopColor="var(--usc-garnet)" stopOpacity="1" />
                <stop offset="60%" stopColor="var(--usc-garnet)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--usc-garnet)" stopOpacity="0" />
              </radialGradient>
              {nodes.slice(0, -1).map((n, i) => {
                const next = nodes[i + 1];
                return <path key={i} id={`pp-edge-${i}`} d={curve(n, next)} />;
              })}
            </defs>

            {/* Edges */}
            {nodes.slice(0, -1).map((n, i) => {
              const next = nodes[i + 1];
              const flowing = n.inflight > 0 || next.inflight > 0;
              return (
                <g key={i}>
                  <use href={`#pp-edge-${i}`} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" strokeLinecap="round" />
                  {flowing && (
                    <use href={`#pp-edge-${i}`} fill="none" stroke="rgba(115,0,10,0.15)" strokeWidth="1" strokeDasharray="2 6" strokeLinecap="round" />
                  )}
                  {/* in-flight count between */}
                  <text x={(n.x + next.x) / 2} y={n.y - 24} textAnchor="middle"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, fill: flowing ? 'var(--usc-garnet)' : 'var(--warm-400)', fontWeight: 600 }}>
                    {n.inflight} ↦
                  </text>
                </g>
              );
            })}

            {/* Traveling particles */}
            {nodes.slice(0, -1).map((n, i) => {
              const next = nodes[i + 1];
              if (!(n.inflight > 0 || next.inflight > 0)) return null;
              return (
                <g key={'p' + i}>
                  {[0, 0.33, 0.66].map((d, j) => (
                    <g key={j}>
                      <circle r="7" fill="url(#particle-grad)" opacity="0.6">
                        <animateMotion dur="1.9s" repeatCount="indefinite" begin={`${d * 1.9}s`}>
                          <mpath href={`#pp-edge-${i}`} />
                        </animateMotion>
                      </circle>
                      <circle r="2.5" fill="var(--usc-garnet)">
                        <animateMotion dur="1.9s" repeatCount="indefinite" begin={`${d * 1.9}s`}>
                          <mpath href={`#pp-edge-${i}`} />
                        </animateMotion>
                      </circle>
                    </g>
                  ))}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const active = n.inflight > 0;
              const hov = hovered === n.id;
              return (
                <g key={n.id}
                  data-insight={`stage-${n.id}`}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(h => h === n.id ? null : h)}
                  style={{ cursor: 'none' }}>
                  {/* breathing outer ring */}
                  {active && (
                    <circle cx={n.x} cy={n.y} r={48} fill="none" stroke={n.color} strokeWidth="1.5" opacity="0.55">
                      <animate attributeName="r" values="40;52;40" dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* outer glass disc with shadow */}
                  <circle cx={n.x + 1} cy={n.y + 4} r={36} fill="rgba(0,0,0,0.08)" />
                  <circle cx={n.x} cy={n.y} r={36}
                    fill="rgba(255,255,255,0.78)"
                    stroke={hov ? 'var(--usc-garnet)' : n.color}
                    strokeWidth={hov ? 2 : 1.4} />
                  {/* gloss top */}
                  <ellipse cx={n.x} cy={n.y - 18} rx={26} ry={9} fill="rgba(255,255,255,0.65)" />
                  {/* number */}
                  <text x={n.x} y={n.y + 4} textAnchor="middle"
                    style={{ fontFamily: 'Source Serif 4, serif', fontSize: 26, fontWeight: 500, fill: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    {n.inflight}
                  </text>
                  <text x={n.x} y={n.y + 18} textAnchor="middle"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8.5, fill: 'var(--warm-500)', letterSpacing: '0.1em' }}>
                    IN FLIGHT
                  </text>
                  {/* label below */}
                  <text x={n.x} y={n.y + 62} textAnchor="middle"
                    style={{ fontFamily: 'Source Serif 4, serif', fontSize: 17, fontWeight: 500, fill: 'var(--ink)' }}>
                    {n.label}
                  </text>
                  <text x={n.x} y={n.y + 80} textAnchor="middle"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: 'var(--warm-500)' }}>
                    {n.short}
                  </text>
                  {/* done count above */}
                  <text x={n.x} y={n.y - 52} textAnchor="middle"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: 'var(--warm-500)' }}>
                    {n.done.toLocaleString()} done
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating stage detail */}
          {hoveredStage && (
            <div className="stage-detail in"
              style={{
                left: `${((hoveredStage.x + 0) / W) * 100}%`,
                top: `calc(${((hoveredStage.y - 110) / H) * 100}% - 200px)`,
                transform: 'translate3d(-50%, 0, 0)',
              }}>
              <div className="t-eyebrow" style={{ marginBottom: 6 }}>stage {nodes.indexOf(hoveredStage) + 1} of {nodes.length}</div>
              <div className="t-h3" style={{ marginBottom: 6 }}>{hoveredStage.label}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--warm-700)' }}>{hoveredStage.desc}</div>
              <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--warm-500)', fontFamily: 'JetBrains Mono, monospace' }}>
                <span><strong style={{ color: 'var(--ink)' }}>{hoveredStage.inflight}</strong> in flight</span>
                <span><strong style={{ color: 'var(--ink)' }}>{hoveredStage.done.toLocaleString()}</strong> done</span>
              </div>
            </div>
          )}
        </GlassCard>
      </Reveal>
    </section>
  );
}

// ============= Insights + Flow combined section =============
function InsightsFlowScene() {
  return (
    <section className="scene" id="qa">
      <div className="scene-header">
        <div className="left">
          <span className="t-eyebrow">Quality & flow</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>An agent watching the wires.</h2>
          <p className="t-body" style={{ marginTop: 10 }}>
            On the left, an LLM surveils <Gloss term="REDCap">REDCap</Gloss> forms, <Gloss term="SQI">SQI</Gloss> flags, and run output. On the right, the people behind every row.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 18, alignItems: 'stretch' }}>
        <Reveal>
          <div className="glass-dark insights" style={{ position: 'relative', overflow: 'hidden' }} data-insight="insights-feed">
            {/* ambient gold glow */}
            <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, background: 'radial-gradient(circle, rgba(255,204,0,0.16) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--usc-gold)', boxShadow: '0 0 10px rgba(255,204,0,0.65)' }} />
                  <span className="t-eyebrow" style={{ color: 'var(--usc-gold)' }}>Agentic QA · live</span>
                </div>
                <div className="t-h2" style={{ color: '#f5f1e8' }}>Insights from the pipeline</div>
                <div style={{ fontSize: 12.5, color: 'rgba(245,241,232,0.65)', marginTop: 4 }}>
                  Surfaced as they happen — flags, forms, anomalies, the small things that need a human.
                </div>
              </div>
              <button style={{ background: 'rgba(255,204,0,0.1)', color: 'var(--usc-gold)', border: '1px solid rgba(255,204,0,0.25)', padding: '5px 10px', borderRadius: 999, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', cursor: 'none' }} data-cursor="hover">
                open log →
              </button>
            </div>
            <div style={{
              marginTop: 18, padding: '16px 18px', minHeight: 200,
              background: 'rgba(0,0,0,0.22)', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <Typewriter items={window.ESD2_INSIGHTS} />
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <GlassCard className="glass" style={{ padding: 0 }}>
            <div style={{ padding: '22px 24px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="t-eyebrow">Recent participant flow</div>
                <div className="t-h2" style={{ marginTop: 4 }}>The last four hours</div>
                <div style={{ fontSize: 12.5, color: 'var(--warm-600)', marginTop: 4 }}>Visit activity across sites — Columbia, Greenville, Charleston.</div>
              </div>
              <Magnetic strength={0.2}>
                <button style={{ background: 'transparent', color: 'var(--usc-garnet)', border: '1px solid rgba(115,0,10,0.18)', padding: '5px 12px', borderRadius: 999, fontSize: 11.5, cursor: 'none' }} data-cursor="hover">view all →</button>
              </Magnetic>
            </div>
            <div className="flow-list" data-insight="flow-list">
              {window.ESD2_PARTICIPANTS.map(p => (
                <div key={p.id} className="flow-row" data-cursor="hover">
                  <span className="t-mono" style={{ fontSize: 12, fontWeight: 500 }}>{p.id}</span>
                  <GroupTag group={p.group} />
                  <span style={{ fontSize: 12.5, color: 'var(--warm-700)' }}>
                    <span className="t-mono" style={{ color: 'var(--warm-500)' }}>{p.visit}</span>
                    <span style={{ color: 'var(--warm-300)', margin: '0 8px' }}>·</span>
                    <Gloss term="CGA">CGA</Gloss> <span className="t-mono">{p.cga}</span>
                    <span style={{ color: 'var(--warm-300)', margin: '0 8px' }}>·</span>
                    <span style={{ color: 'var(--warm-500)' }}>{p.site}</span>
                  </span>
                  <StatusPill status={p.status} />
                  <span className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)', minWidth: 48, textAlign: 'right' }}>{p.when} ago</span>
                  <span className="chev"><Icon name="chevron-right" size={16} /></span>
                </div>
              ))}
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}

// ============= Closing section: study sites & footer =============
function ClosingScene() {
  const sites = [
    { name: 'Columbia',    sub: 'USC IMB · lab', lat: 'Prisma · Midlands' },
    { name: 'Greenville',  sub: 'Prisma · Upstate', lat: 'NICU follow-up' },
    { name: 'Charleston',  sub: 'MUSC · NICU',  lat: 'recruitment partner' },
  ];
  return (
    <section className="scene" id="sites" style={{ paddingBottom: 140 }}>
      <div className="scene-header">
        <div className="left">
          <span className="t-eyebrow">Where the work happens</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>South Carolina, three NICUs.</h2>
          <p className="t-body" style={{ marginTop: 10 }}>
            Every visit is in-person. Every <Gloss term="Actiheart">Actiheart-5</Gloss> is hand-fitted. Every caregiver gets a written summary before they leave the room.
          </p>
        </div>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {sites.map((s, i) => (
          <Reveal key={s.name} delay={i * 100}>
            <GlassCard className="kpi" data-cursor="hover" accent="var(--peach-soft)">
              <div className="t-eyebrow">Site</div>
              <div className="t-h1" style={{ fontSize: 36, marginTop: 6 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: 'var(--warm-600)', marginTop: 4 }}>{s.sub}</div>
              <div className="kpi-foot">
                <span className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)' }}>{s.lat}</span>
                <Icon name="map-pin" size={16} color="var(--usc-garnet)" />
              </div>
            </GlassCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { KPIDeck, PipelineScene, InsightsFlowScene, ClosingScene });
