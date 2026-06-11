// Results — HRV trajectory + HDA phase distribution + downloadable figures.
const { useState: useStateR, useMemo: useMemoR } = React;

function ScreenResults() {
  const [metric, setMetric] = useStateR('rmssd');
  const traj = useMemoR(() => window.makeTrajectory(), []);
  const months = traj.months;

  const W = 720, H = 280, padL = 50, padR = 20, padT = 20, padB = 36;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  // Y-domain
  const all = Object.values(traj.series).flat().map(p => p.y);
  const yMin = Math.floor(Math.min(...all) - 4), yMax = Math.ceil(Math.max(...all) + 4);
  const xMin = months[0], xMax = months[months.length - 1];

  const sx = x => padL + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = y => padT + (1 - (y - yMin) / (yMax - yMin)) * innerH;

  const grpColor = { VPT: C.garnet, ASIB: C.purple, TD: C.s500 };

  // For HDA dist
  const hdaPhases = ['orienting', 'sustained', 'inattention', 'termination'];
  const hdaColors = { orienting: C.blue, sustained: C.green, inattention: C.purple, termination: C.red };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s400, letterSpacing: '.08em', textTransform: 'uppercase' }}>Results · preview</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 32, fontWeight: 600, letterSpacing: '-0.015em', marginTop: 4, lineHeight: 1.05 }}>
            HRV trajectories &amp; <Gloss term="HDA">HDA</Gloss> phase distribution
          </div>
          <div style={{ color: C.s500, fontSize: 13, marginTop: 6, fontFamily: "'Source Serif 4', serif", maxWidth: 620 }}>
            Generated from data/processed/deidentified/. Figures are matplotlib-rendered server-side; this dashboard view is a fast preview.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" icon="image">Open figure</Button>
          <Button variant="secondary" icon="download">Export · PDF</Button>
          <Button icon="copy">Copy citation</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <Card pad={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <SectionLabel>HRV trajectory · group means ± 95 % CI</SectionLabel>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 18, fontWeight: 600, marginTop: 2 }}>
                <Gloss term="RMSSD">{metric.toUpperCase()}</Gloss> across <Gloss term="CGA">CGA</Gloss>
              </div>
            </div>
            <Segmented size="sm" options={[{value:'rmssd',label:'RMSSD'},{value:'hf',label:'HF'},{value:'sdnn',label:'SDNN'}]} value={metric} onChange={setMetric} />
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
            {/* y gridlines */}
            {[yMin, (yMin + yMax) / 2, yMax].map(y => (
              <g key={y}>
                <line x1={padL} y1={sy(y)} x2={W - padR} y2={sy(y)} stroke={C.s100} strokeWidth={1} />
                <text x={padL - 8} y={sy(y) + 3} textAnchor="end" style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: C.s500 }}>{y.toFixed(0)}</text>
              </g>
            ))}
            {/* x ticks */}
            {months.map(m => (
              <g key={m}>
                <line x1={sx(m)} y1={H - padB} x2={sx(m)} y2={H - padB + 4} stroke={C.s400} />
                <text x={sx(m)} y={H - padB + 18} textAnchor="middle" style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: C.s500 }}>{m} mo</text>
              </g>
            ))}
            <text x={padL} y={H - 6} style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: C.s500 }}>CGA (months)</text>
            <text x={padL - 38} y={padT + 8} style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: C.s500 }}>{metric === 'rmssd' ? 'ms' : metric === 'hf' ? 'ms²' : 'ms'}</text>

            {/* CI ribbons + lines */}
            {Object.entries(traj.series).map(([grp, pts]) => {
              const color = grpColor[grp];
              const top = pts.map(p => `${sx(p.x)},${sy(p.y + 2.5)}`).join(' ');
              const bot = pts.slice().reverse().map(p => `${sx(p.x)},${sy(p.y - 2.5)}`).join(' ');
              const line = pts.map((p, i) => (i ? 'L' : 'M') + sx(p.x) + ' ' + sy(p.y)).join(' ');
              return (
                <g key={grp}>
                  <polygon points={top + ' ' + bot} fill={color} opacity={0.1} />
                  <path d={line} fill="none" stroke={color} strokeWidth={2} />
                  {pts.map((p, i) => (
                    <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill="#fff" stroke={color} strokeWidth={1.5} />
                  ))}
                  {/* end label */}
                  <text x={sx(pts[pts.length - 1].x) + 6} y={sy(pts[pts.length - 1].y) + 3}
                    style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: color, fontWeight: 600 }}>{grp}</text>
                </g>
              );
            })}
          </svg>

          <div style={{ display: 'flex', gap: 18, marginTop: 8, paddingTop: 12, borderTop: `1px solid ${C.s100}`, fontSize: 11, color: C.s500 }}>
            {Object.entries(traj.series).map(([grp, pts]) => (
              <Tooltip key={grp} text={`${grp} · n=${pts[0].n} at 3 mo, n=${pts[pts.length - 1].n} at 24 mo. Group mean increases with maturation.`} maxWidth={300}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'help' }}>
                  <span style={{ width: 14, height: 2, background: grpColor[grp] }} />
                  <Gloss term={grp}>{grp}</Gloss>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>n={pts[0].n}</span>
                </span>
              </Tooltip>
            ))}
            <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>LGCM · MICE-imputed · k=20</span>
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>HDA phase share · per group</SectionLabel>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 18, fontWeight: 600, marginTop: 2, marginBottom: 14 }}>Attention episodes</div>
          {Object.entries(window.HDA_DIST).map(([grp, dist]) => {
            const total = hdaPhases.reduce((s, p) => s + dist[p], 0);
            return (
              <div key={grp} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: grpColor[grp] }} />
                    <Gloss term={grp}>{grp}</Gloss>
                  </span>
                  <span style={{ fontSize: 10, color: C.s500, fontFamily: "'JetBrains Mono', monospace" }}>{total} epochs</span>
                </div>
                <div style={{ display: 'flex', height: 18, borderRadius: 2, overflow: 'hidden', background: C.s100 }}>
                  {hdaPhases.map(ph => (
                    <Tooltip key={ph} maxWidth={280}
                      text={`${ph}: ${dist[ph]} epochs (${((dist[ph] / total) * 100).toFixed(1)} %). ${window.GLOSS[ph.charAt(0).toUpperCase() + ph.slice(1)] || ''}`}>
                      <div style={{ width: `${(dist[ph] / total) * 100}%`, background: hdaColors[ph], height: 18, cursor: 'help' }} />
                    </Tooltip>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: C.s700, paddingTop: 8, borderTop: `1px solid ${C.s100}` }}>
            {hdaPhases.map(ph => (
              <Tooltip key={ph} gloss={ph.charAt(0).toUpperCase() + ph.slice(1)} maxWidth={280}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'help' }}>
                  <span style={{ width: 9, height: 9, background: hdaColors[ph], borderRadius: 1 }} />
                  <span style={{ borderBottom: `1px dotted ${C.s400}` }}>{ph}</span>
                </span>
              </Tooltip>
            ))}
          </div>
        </Card>
      </div>

      {/* Manuscript-bound stats card */}
      <Card pad={20}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <SectionLabel>Manuscript table T1 · group × visit summary</SectionLabel>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.s500 }}>auto-rebuilt on merge · last 09:18</span>
        </div>
        <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Group', 'n', 'CGA 3 mo', 'CGA 6 mo', 'CGA 9 mo', 'CGA 12 mo', 'CGA 18 mo', 'CGA 24 mo'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: C.s500, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.s300}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(traj.series).map(([grp, pts]) => (
              <tr key={grp}>
                <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.s100}`, fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: grpColor[grp] }} />
                    <Gloss term={grp}>{grp}</Gloss>
                  </span>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.s100}`, fontFamily: "'JetBrains Mono', monospace" }}>{pts[0].n}</td>
                {pts.map((p, i) => (
                  <td key={i} style={{ padding: '10px 12px', borderBottom: `1px solid ${C.s100}`, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                    {p.y.toFixed(1)} <span style={{ color: C.s400, fontSize: 10 }}>±2.5</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

Object.assign(window, { ScreenResults });
