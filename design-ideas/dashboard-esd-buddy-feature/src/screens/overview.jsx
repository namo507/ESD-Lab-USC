// Pipeline overview — DAG (default), Sankey, Kanban tweak views.
// Plus: throughput sparklines, stage detail drawer, run-pipeline button.
const { useState: useStateO, useMemo: useMemoO } = React;

function StatusDot({ kind, size = 8 }) {
  const map = { running: C.blue, queued: C.s400, done: C.green, fail: C.red, idle: C.s300 };
  return <span className={kind === 'running' ? 'pulse-dot' : ''} style={{
    width: size, height: size, borderRadius: '50%', background: map[kind] || C.s400,
    display: 'inline-block', flexShrink: 0,
  }} />;
}

// Build throughput history for sparklines (deterministic)
function tputHistory(rate, len = 24) {
  const arr = [];
  for (let i = 0; i < len; i++) {
    const noise = ((i * 9301) % 233) / 233 - 0.5;
    arr.push(Math.max(0, rate * (0.7 + 0.4 * Math.sin(i / 3) + noise * 0.3)));
  }
  return arr;
}

// ===================== DAG VIEW =====================
function PipelineDAG({ stages, onSelect, selected }) {
  const W = 1080, H = 360;
  const padX = 60;
  const colW = (W - padX * 2) / (stages.length - 1);
  const cy = 180;

  // node positions
  const nodes = stages.map((s, i) => ({ ...s, x: padX + i * colW, y: cy }));

  // Build the curved edges between nodes
  function curve(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ position: 'relative', background: '#fff' }}>
        {/* grid backdrop */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(to right, #f3f1ed 1px, transparent 1px), linear-gradient(to bottom, #f3f1ed 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.6,
          pointerEvents: 'none',
        }} />
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', position: 'relative' }}>
          {/* edges */}
          {nodes.slice(0, -1).map((n, i) => {
            const next = nodes[i + 1];
            const flowing = n.inflight > 0 || next.inflight > 0;
            return (
              <g key={i}>
                <path d={curve(n.x + 32, n.y, next.x - 32, next.y)}
                  fill="none" stroke={C.s200} strokeWidth={6} />
                <path d={curve(n.x + 32, n.y, next.x - 32, next.y)}
                  fill="none" stroke={flowing ? C.blue : C.s300} strokeWidth={2}
                  strokeDasharray={flowing ? '4 4' : '0'}
                  className={flowing ? 'flow-line' : ''} />
                {/* throughput label on edge */}
                <text x={(n.x + next.x) / 2} y={n.y - 14} textAnchor="middle"
                  style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: flowing ? C.blue : C.s400, fontWeight: 600 }}>
                  {n.rate}/h
                </text>
              </g>
            );
          })}

          {/* nodes */}
          {nodes.map((n, i) => {
            const isSel = selected === n.id;
            return (
              <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: 'pointer' }}>
                {/* IN FLIGHT pill above */}
                {n.inflight > 0 && (
                  <g>
                    <rect x={n.x - 38} y={n.y - 78} width={76} height={20} rx={2}
                      fill={C.blue} />
                    <text x={n.x} y={n.y - 64} textAnchor="middle"
                      style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#fff', fontWeight: 700, letterSpacing: '.08em' }}>
                      {n.inflight} IN FLIGHT
                    </text>
                    <path d={`M ${n.x - 4} ${n.y - 58} L ${n.x} ${n.y - 52} L ${n.x + 4} ${n.y - 58} Z`} fill={C.blue} />
                  </g>
                )}
                {/* outer ring */}
                <circle cx={n.x} cy={n.y} r={32}
                  fill="#fff"
                  stroke={isSel ? C.garnet : (n.inflight > 0 ? C.blue : C.s300)}
                  strokeWidth={isSel ? 2.5 : 1.5} />
                {/* big inflight or done count */}
                <text x={n.x} y={n.y + 4} textAnchor="middle"
                  style={{ fontFamily: "'Source Serif 4', serif", fontSize: 22, fontWeight: 600, fill: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {n.done >= 1000 ? (n.done / 1000).toFixed(1) + 'k' : n.done}
                </text>
                {/* label */}
                <text x={n.x} y={n.y + 56} textAnchor="middle"
                  style={{ fontSize: 13, fontWeight: 600, fill: isSel ? C.garnet : C.ink }}>{n.label}</text>
                <text x={n.x} y={n.y + 72} textAnchor="middle"
                  style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: C.s500 }}>{n.short}</text>
                <text x={n.x} y={n.y + 88} textAnchor="middle"
                  style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: n.fail > 0 ? C.red : C.s500 }}>
                  {n.done.toLocaleString()} done · {n.fail} fail
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

// ===================== SANKEY VIEW =====================
function PipelineSankey({ stages, onSelect, selected }) {
  const W = 1080, H = 320;
  const padX = 30, padY = 24;
  const usableW = W - padX * 2;
  const stepW = usableW / stages.length;

  // Compute flow widths from done counts (smooth from largest to smallest)
  const max = stages[0].done;
  const widths = stages.map(s => Math.max(20, (s.done / max) * (H - padY * 2)));

  return (
    <Card pad={0}>
      <div style={{ background: '#fff', position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          {stages.slice(0, -1).map((s, i) => {
            const x1 = padX + i * stepW + stepW * 0.5;
            const x2 = padX + (i + 1) * stepW + stepW * 0.5;
            const y1 = H / 2;
            const y2 = H / 2;
            const w1 = widths[i];
            const w2 = widths[i + 1];
            const flowing = s.inflight > 0;
            const top1 = y1 - w1 / 2, bot1 = y1 + w1 / 2;
            const top2 = y2 - w2 / 2, bot2 = y2 + w2 / 2;
            const mx = (x1 + x2) / 2;
            const path = `
              M ${x1} ${top1}
              C ${mx} ${top1}, ${mx} ${top2}, ${x2} ${top2}
              L ${x2} ${bot2}
              C ${mx} ${bot2}, ${mx} ${bot1}, ${x1} ${bot1}
              Z`;
            return (
              <g key={i}>
                <path d={path} fill={flowing ? C.blueT : C.s100} stroke="none" />
                {/* lost flow (rejects) */}
                {s.fail > 0 && (
                  <g>
                    <path d={`M ${x1 + (x2 - x1) * 0.3} ${bot1 - 2} L ${x1 + (x2 - x1) * 0.6} ${H - 8}`}
                      stroke={C.red} strokeWidth={Math.max(1.2, (s.fail / s.done) * 30)} opacity={0.3} fill="none" />
                    <text x={x1 + (x2 - x1) * 0.6} y={H - 12}
                      style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: C.red }}>
                      –{s.fail}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {/* stage bars */}
          {stages.map((s, i) => {
            const x = padX + i * stepW + stepW * 0.5;
            const w = widths[i];
            const isSel = selected === s.id;
            return (
              <g key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
                <rect x={x - 6} y={H / 2 - w / 2} width={12} height={w}
                  fill={isSel ? C.garnet : (s.inflight > 0 ? C.blue : C.s500)} />
                <text x={x} y={H / 2 - w / 2 - 28} textAnchor="middle"
                  style={{ fontSize: 13, fontWeight: 600, fill: C.ink }}>{s.label}</text>
                <text x={x} y={H / 2 - w / 2 - 14} textAnchor="middle"
                  style={{ fontFamily: "'Source Serif 4', serif", fontSize: 18, fontWeight: 600, fill: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {s.done.toLocaleString()}
                </text>
                <text x={x} y={H / 2 + w / 2 + 18} textAnchor="middle"
                  style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: C.s500 }}>
                  {s.inflight} in flight
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

// ===================== KANBAN VIEW =====================
function PipelineKanban({ stages, onSelect, selected, participants }) {
  // Distribute mock participants/visits across stages by index
  const cardsPerStage = stages.map((s, i) => {
    const start = i * 3;
    return participants.slice(start, start + Math.min(s.inflight, 5));
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
      gap: 8,
    }}>
      {stages.map((s, i) => {
        const isSel = selected === s.id;
        return (
          <div key={s.id} onClick={() => onSelect(s.id)}
            style={{
              background: isSel ? C.s50 : C.paper,
              border: `1px solid ${isSel ? C.s300 : C.s200}`,
              borderTop: `2px solid ${s.inflight > 0 ? C.blue : C.s300}`,
              borderRadius: 2, padding: 10, cursor: 'pointer',
              minHeight: 280, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{s.label}</div>
                <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.s500 }}>
                  {s.inflight}<span style={{ color: C.s400 }}> · {s.queued}</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: C.s500, fontFamily: "'JetBrains Mono', monospace" }}>{s.short}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cardsPerStage[i].map(p => (
                <div key={p.id} style={{
                  background: '#fff', border: `1px solid ${C.s200}`,
                  padding: 8, fontSize: 11, lineHeight: 1.3,
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: C.ink }}>{p.id}</span>
                    <Badge kind={p.group === 'VPT' ? 'vpt' : p.group === 'ASIB' ? 'asib' : 'td'} size="sm">{p.group}</Badge>
                  </div>
                  <div style={{ color: C.s500, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{p.visit} · {p.windows} w</div>
                </div>
              ))}
              {s.queued > 0 && (
                <div style={{
                  background: 'transparent', border: `1px dashed ${C.s300}`,
                  padding: 6, fontSize: 10, color: C.s500, textAlign: 'center',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>+ {s.queued} queued</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===================== STAGE DRAWER =====================
function StageDrawer({ stage }) {
  if (!stage) return null;
  const tput = tputHistory(stage.rate);
  const total = stage.done + stage.inflight + stage.queued + stage.fail;
  const segs = [
    { name: 'done', n: stage.done, color: C.green },
    { name: 'in flight', n: stage.inflight, color: C.blue },
    { name: 'queued', n: stage.queued, color: C.s400 },
    { name: 'failed', n: stage.fail, color: C.red },
  ];
  return (
    <Card pad={20} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <SectionLabel>Stage · {stage.id}</SectionLabel>
          <Badge kind={stage.inflight > 0 ? 'info' : 'neutral'}>
            {stage.inflight > 0 ? 'running' : 'idle'}
          </Badge>
        </div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{stage.label}</div>
        <div style={{ fontSize: 13, color: C.s700, marginTop: 8, lineHeight: 1.55 }}>{stage.description}</div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <SectionLabel>Throughput · last 24 h</SectionLabel>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.s500 }}>
            <span style={{ color: C.ink, fontWeight: 600 }}>{stage.rate}</span> windows/h
          </span>
        </div>
        <Sparkline values={tput} w={300} h={36} color={C.blue} fill dotLast />
      </div>

      <div>
        <SectionLabel style={{ marginBottom: 6 }}>Window distribution</SectionLabel>
        <div style={{ display: 'flex', height: 8, borderRadius: 2, overflow: 'hidden', background: C.s100 }}>
          {segs.map(s => (
            <Tooltip key={s.name} text={`${s.name} · ${s.n.toLocaleString()} (${((s.n/total)*100).toFixed(1)}%)`}>
              <div style={{ width: `${(s.n / total) * 300}px`, background: s.color, height: 8 }} />
            </Tooltip>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          {segs.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span style={{ width: 7, height: 7, background: s.color, borderRadius: 1 }} />
              <span style={{ color: C.s700 }}>{s.name}</span>
              <span style={{ color: C.s500, fontFamily: "'JetBrains Mono', monospace" }}>{s.n.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 12 }}>
        <div style={{ padding: '8px 10px', background: C.s50, border: `1px solid ${C.s200}`, borderRadius: 2 }}>
          <div style={{ fontSize: 10, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>ETA</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", marginTop: 2, fontWeight: 600 }}>{stage.eta}</div>
        </div>
        <div style={{ padding: '8px 10px', background: C.s50, border: `1px solid ${C.s200}`, borderRadius: 2 }}>
          <div style={{ fontSize: 10, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Pass rate</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", marginTop: 2, fontWeight: 600 }}>
            {((stage.done / (stage.done + stage.fail)) * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <Button variant="secondary" size="sm" icon="external-link">View logs</Button>
        <Button variant="secondary" size="sm" icon="rotate-cw">Rerun stage</Button>
      </div>
    </Card>
  );
}

// ===================== OVERVIEW SCREEN =====================
function ScreenOverview({ pipelineStyle, setRoute, study }) {
  const [selected, setSelected] = useStateO('hrv');
  const stage = window.STAGES.find(s => s.id === selected);

  const total = window.STAGES.reduce((s, x) => s + x.done, 0);
  const inflight = window.STAGES.reduce((s, x) => s + x.inflight, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s400, letterSpacing: '.08em', textTransform: 'uppercase' }}>Pipeline · 2026-04-25</span>
            <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.blue }}>1 run active</span>
          </div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 32, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.05 }}>
            From <Gloss term="Actiheart5">Actiheart-5</Gloss> to manuscript
          </div>
          <div style={{ color: C.s500, fontSize: 14, marginTop: 6, maxWidth: 620, fontFamily: "'Source Serif 4', serif" }}>
            6 stages · {total.toLocaleString()} windows processed this study · {inflight} currently in flight.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" icon="calendar">Last 24 h</Button>
          <Button icon="play" onClick={() => setRoute({ name: 'runs' })}>Run pipeline</Button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <KPI label="Enrolled" value={study.enrolled} unit={`/ ${study.target}`}
          sub="VPT · ASIB · TD" delta="+4 / wk" deltaKind="up"
          spark={[18, 22, 28, 35, 41, 48, 56, 64, 71, 79, 88, 95, 108, 118, 128, 142, 156, 168, 184, 198, 212, 224, 231]} />
        <KPI label="Windows · 24 h" value="1,824" gloss="Window"
          sub="ECG 5-s epochs ingested" delta="+312" deltaKind="up"
          spark={tputHistory(312, 24)} />
        <KPI label="QA pass rate" value="92" unit="%"
          sub="target ≥ 90 %" delta="+0.4 pp" deltaKind="up" gloss="SQI"
          spark={[88, 89, 91, 88, 90, 92, 91, 93, 92, 91, 92, 92, 91, 92, 93, 92]} />
        <KPI label="Median RMSSD" value="38.4" unit="ms" gloss="RMSSD"
          sub="cohort · all visits" delta="±0.6" deltaKind="flat"
          spark={[35, 36, 37, 36, 38, 37, 39, 38, 38, 39, 38, 38]} />
        <KPI label="PHI exports" value="0"
          sub="rolling 7 d · safe" delta="✓ clean" deltaKind="up" gloss="PHI" />
      </div>

      {/* Pipeline visualization */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="git-branch" size={16} color={C.garnet} />
          <h3 style={{ margin: 0, fontFamily: "'Source Sans 3', sans-serif", fontSize: 16, fontWeight: 600 }}>Live pipeline</h3>
          <Badge kind="neutral" size="sm" mono>{pipelineStyle}</Badge>
        </div>
        <div style={{ fontSize: 11, color: C.s500, fontFamily: "'JetBrains Mono', monospace" }}>
          tip · click a stage for detail · hover for help
        </div>
      </div>

      {pipelineStyle === 'dag' && <PipelineDAG stages={window.STAGES} onSelect={setSelected} selected={selected} />}
      {pipelineStyle === 'sankey' && <PipelineSankey stages={window.STAGES} onSelect={setSelected} selected={selected} />}
      {pipelineStyle === 'kanban' && <PipelineKanban stages={window.STAGES} onSelect={setSelected} selected={selected} participants={window.PARTICIPANTS} />}

      {/* Drawer + recent runs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
        <StageDrawer stage={stage} />
        <Card pad={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.s200}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionLabel>Recent runs</SectionLabel>
            <Button variant="ghost" size="sm" iconRight="chevron-right" onClick={() => setRoute({ name: 'runs' })}>All runs</Button>
          </div>
          <div>
            {window.RUNS.slice(0, 5).map(r => (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '14px 1fr auto auto',
                gap: 10, alignItems: 'center', padding: '10px 18px',
                borderBottom: `1px solid ${C.s100}`, fontSize: 12,
              }}>
                <StatusDot kind={r.status} />
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", color: C.ink, fontWeight: 500 }}>{r.id}</div>
                  <div style={{ fontSize: 11, color: C.s500 }}>{r.scope} · by {r.actor}</div>
                </div>
                <Badge kind={r.status === 'done' ? 'ok' : r.status === 'fail' ? 'fail' : r.status === 'running' ? 'info' : 'neutral'} size="sm">
                  {r.status}
                </Badge>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: C.s500, fontSize: 11, minWidth: 60, textAlign: 'right' }}>{r.duration}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenOverview, StatusDot });
