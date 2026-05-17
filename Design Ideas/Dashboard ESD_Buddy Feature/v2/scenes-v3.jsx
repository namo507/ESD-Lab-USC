// v3 scenes: Cohort Snapshot table · ML Performance · Reading Library.
// Demonstrates the architectural remediations from the audit:
//   - min-width: 0 on flex children for clean text truncation
//   - -webkit-line-clamp for multi-line abstracts
//   - auto-fit grids for symmetrical reflow
//   - intersection observer threshold 0.15 (set in lib's Reveal)
//   - custom select pills, SVG search icon, hoisted table controls
const { useState: useSs, useMemo: useMs, useEffect: useEs, useRef: useRs } = React;

// ============================================================
// Section 10: Cohort Snapshot Table
// ============================================================
function CohortTable() {
  const [grpF, setGrpF] = useSs('all');
  const [qcF, setQcF] = useSs('all');
  const [sort, setSort] = useSs({ key: 'complete', dir: 'desc' });

  const rows = useMs(() => {
    let r = window.ESD2_COHORT.slice();
    if (grpF !== 'all') r = r.filter(x => x.group === grpF);
    if (qcF !== 'all')  r = r.filter(x => x.qc === qcF);
    r.sort((a, b) => {
      const A = a[sort.key], B = b[sort.key];
      const sign = sort.dir === 'desc' ? -1 : 1;
      if (typeof A === 'number') return (A - B) * sign;
      return String(A).localeCompare(String(B)) * sign;
    });
    return r;
  }, [grpF, qcF, sort]);

  return (
    <section className="scene" id="cohort">
      <div className="scene-header">
        <div className="left flex-min">
          <span className="t-eyebrow">Cohort snapshot</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>Every infant, every visit.</h2>
          <p className="t-body">
            <Gloss term="VPT">VPT</Gloss>, <Gloss term="ASIB">ASIB</Gloss> and <Gloss term="TD">TD</Gloss> cohorts side-by-side.
            Sort any column; numerics align right for fast visual scanning.
          </p>
        </div>
      </div>

      <Reveal>
        <GlassCard style={{ padding: 0, overflow: 'hidden' }} data-insight="cohort-table">
          {/* Controls hoisted into table header per audit §10 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, padding: '18px 22px', borderBottom: '1px solid rgba(0,0,0,0.06)',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="t-eyebrow" style={{ color: 'var(--warm-500)' }}>filter</span>
              <select className="select-pill" value={grpF} onChange={e => setGrpF(e.target.value)} data-cursor="hover">
                <option value="all">All groups</option>
                <option value="VPT">VPT</option>
                <option value="ASIB">ASIB</option>
                <option value="TD">TD</option>
              </select>
              <select className="select-pill" value={qcF} onChange={e => setQcF(e.target.value)} data-cursor="hover">
                <option value="all">All QC</option>
                <option value="ok">OK</option>
                <option value="review">Review</option>
                <option value="flag">Flag</option>
              </select>
            </div>
            <div className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)' }}>
              {rows.length} of {window.ESD2_COHORT.length} participants
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {[
                    { k: 'id',       l: 'Participant', cls: '' },
                    { k: 'group',    l: 'Group',       cls: '' },
                    { k: 'ga',       l: 'GA (wk)',     cls: 'num', gloss: 'CGA' },
                    { k: 'bw',       l: 'Birth wt (g)',cls: 'num' },
                    { k: 'complete', l: 'Complete %',  cls: 'num' },
                    { k: 'qc',       l: 'QC',          cls: '' },
                    { k: 'site',     l: 'Site',        cls: '' },
                  ].map(h => (
                    <th key={h.k} className={h.cls}
                      onClick={() => setSort(s => ({ key: h.k, dir: s.key === h.k && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      data-cursor="hover" style={{ cursor: 'none' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {h.gloss ? <Gloss term={h.gloss}>{h.l}</Gloss> : h.l}
                        {sort.key === h.k && (
                          <Icon name={sort.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={10} color="var(--usc-garnet)" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} data-cursor="hover">
                    <td className="id">{r.id}</td>
                    <td><GroupTag group={r.group} /></td>
                    <td className="num">{r.ga.toFixed(1)}</td>
                    <td className="num">{r.bw.toLocaleString()}</td>
                    <td className="num">
                      <span style={{ color: r.complete >= 80 ? '#2d6a3e' : r.complete >= 50 ? '#8b5a1c' : '#7a2f33' }}>
                        {r.complete}%
                      </span>
                    </td>
                    <td><span className={`pill-status ${r.qc}`}>{r.qc.toUpperCase()}</span></td>
                    <td style={{ color: 'var(--warm-600)' }}>{r.site}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}

// ============================================================
// Section 8: ML Performance — ROC + SHAP + Confusion Matrix
// ============================================================
function ROCCurve() {
  // Synthetic but realistic ROC: 30 points climbing from origin to ~(0.18, 0.9)
  const points = useMs(() => {
    const pts = [[0, 0]];
    for (let i = 1; i <= 28; i++) {
      const t = i / 28;
      const x = Math.pow(t, 2.2);
      const y = Math.min(1, Math.pow(t, 0.45) + 0.02);
      pts.push([x, y]);
    }
    pts.push([1, 1]);
    return pts;
  }, []);

  const W = 360, H = 240, padL = 38, padB = 32, padT = 18, padR = 14;
  const sx = x => padL + x * (W - padL - padR);
  const sy = y => H - padB - y * (H - padB - padT);
  const d = points.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join(' ');
  const auc = 0.899;

  return (
    <GlassCard className="chart-card" style={{ padding: '22px 24px 20px' }} data-insight="roc">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div className="flex-min">
          <span className="t-eyebrow">ROC curve</span>
          <div className="t-h3" style={{ marginTop: 4 }}>Validation hold-out</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)' }}>AUROC</div>
          <div style={{ fontFamily: 'Source Serif 4, serif', fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>{auc}</div>
        </div>
      </div>
      {/* Legend hoisted ABOVE the chart (audit §8) */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--warm-600)', marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: 'var(--usc-garnet)' }} /> Model
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: 'var(--warm-400)', borderTop: '1px dashed' }} /> Chance
        </span>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <g key={t}>
            <line x1={sx(0)} y1={sy(t)} x2={sx(1)} y2={sy(t)} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
            <text x={padL - 6} y={sy(t) + 3} textAnchor="end" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: 'var(--warm-500)' }}>{t.toFixed(2)}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <text key={'x' + t} x={sx(t)} y={H - 14} textAnchor="middle" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: 'var(--warm-500)' }}>{t.toFixed(2)}</text>
        ))}
        {/* chance diagonal */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--warm-400)" strokeWidth="1" strokeDasharray="3 4" />
        {/* AUC fill */}
        <path d={`${d} L ${sx(1)} ${sy(0)} Z`} fill="var(--usc-garnet)" opacity="0.1" />
        {/* curve */}
        <path d={d} fill="none" stroke="var(--usc-garnet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* axis labels */}
        <text x={W / 2} y={H - 2} textAnchor="middle" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: 'var(--warm-600)' }}>False positive rate</text>
        <text x={10} y={H / 2} textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: 'var(--warm-600)' }}>True positive rate</text>
      </svg>
    </GlassCard>
  );
}

function SHAPChart() {
  const items = window.ESD2_SHAP;
  const max = Math.max(...items.map(i => i.val));
  const groupColor = { HRV: 'var(--usc-garnet)', HDA: 'var(--purple, #8172B2)', demo: 'var(--warm-500)' };

  return (
    <GlassCard className="chart-card" style={{ padding: '22px 24px 22px' }} data-insight="shap">
      <div style={{ marginBottom: 10 }} className="flex-min">
        <span className="t-eyebrow">SHAP · top predictors</span>
        <div className="t-h3" style={{ marginTop: 4 }}>What drives the classifier</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 52px', gap: 12, alignItems: 'center', minWidth: 0 }}>
            <span className="truncate" style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{it.feat}</span>
            <div style={{ position: 'relative', height: 12, background: 'rgba(0,0,0,0.05)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                width: `${(it.val / max) * 100}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${groupColor[it.group]} 0%, rgba(115,0,10,0.5) 100%)`,
                borderRadius: 999,
                transition: 'width 800ms var(--ease-soft)',
              }} />
            </div>
            <span className="t-mono" style={{ fontSize: 11, color: 'var(--warm-600)', textAlign: 'right' }}>{(it.val * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 16, fontSize: 11, color: 'var(--warm-600)' }}>
        {Object.entries(groupColor).map(([g, c]) => (
          <span key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, background: c, borderRadius: 2 }} /> {g}
          </span>
        ))}
      </div>
    </GlassCard>
  );
}

function ConfMatrixCard() {
  return (
    <GlassCard className="chart-card" style={{ padding: '22px 24px 22px' }} data-insight="confmat">
      <div className="flex-min" style={{ marginBottom: 6 }}>
        <span className="t-eyebrow">Confusion matrix · summary</span>
        <div className="t-h3" style={{ marginTop: 4 }}>Threshold @ 0.42</div>
      </div>
      <div className="confmat">
        <div className="cell tp">
          <span className="t-mono" style={{ fontSize: 10, opacity: 0.7 }}>TRUE POSITIVE</span>
          <span className="v">38</span>
        </div>
        <div className="cell fn">
          <span className="t-mono" style={{ fontSize: 10, opacity: 0.7 }}>FALSE NEGATIVE</span>
          <span className="v">4</span>
        </div>
        <div className="cell fp">
          <span className="t-mono" style={{ fontSize: 10, opacity: 0.7 }}>FALSE POSITIVE</span>
          <span className="v">9</span>
        </div>
        <div className="cell tn">
          <span className="t-mono" style={{ fontSize: 10, opacity: 0.7 }}>TRUE NEGATIVE</span>
          <span className="v">181</span>
        </div>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 18,
        fontSize: 11, color: 'var(--warm-600)',
      }}>
        {[
          { l: 'F1',       v: 0.853 },
          { l: 'Precision',v: 0.809 },
          { l: 'Recall',   v: 0.905 },
        ].map(s => (
          <div key={s.l} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.5)', borderRadius: 10 }}>
            <div className="t-mono" style={{ fontSize: 10, color: 'var(--warm-500)' }}>{s.l.toUpperCase()}</div>
            <div style={{ fontFamily: 'Source Serif 4, serif', fontSize: 22, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.015em', marginTop: 2 }}>{s.v}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function MLPerformance() {
  return (
    <section className="scene" id="ml">
      <div className="scene-header">
        <div className="left flex-min">
          <span className="t-eyebrow">Model performance</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>Calibrated, not just accurate.</h2>
          <p className="t-body">
            A gradient-boosted classifier reads 3- and 6-month <Gloss term="RMSSD">HRV features</Gloss> and predicts later
            autism-likelihood. We watch <Gloss term="HDA">SHAP attributions</Gloss> as carefully as the headline AUROC.
          </p>
        </div>
      </div>
      <Reveal>
        <div className="ml-grid">
          <ROCCurve />
          <SHAPChart />
          <ConfMatrixCard />
        </div>
      </Reveal>
    </section>
  );
}

// ============================================================
// Section 11: Reading Library — accordion + SVG search
// ============================================================
function ReadingLibrary() {
  const [q, setQ] = useSs('');
  const [open, setOpen] = useSs(0);

  const items = useMs(() => {
    const all = window.ESD2_READING;
    if (!q.trim()) return all;
    const needle = q.toLowerCase();
    return all.filter(it =>
      it.title.toLowerCase().includes(needle) ||
      it.meta.toLowerCase().includes(needle) ||
      it.abs.toLowerCase().includes(needle)
    );
  }, [q]);

  return (
    <section className="scene" id="library" style={{ paddingBottom: 140 }}>
      <div className="scene-header">
        <div className="left flex-min">
          <span className="t-eyebrow">Anchor reading</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>Where this work points.</h2>
          <p className="t-body">
            The four papers that anchor the <Gloss term="NANO">NANO</Gloss> protocol. Click any title for the abstract.
          </p>
        </div>
        <div className="search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, author, abstract…" data-cursor="text" />
        </div>
      </div>
      <Reveal>
        <GlassCard style={{ padding: '12px 28px' }} data-insight="reading-library">
          {items.length === 0 ? (
            <div style={{
              padding: '60px 20px', textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace', color: 'var(--warm-500)', fontSize: 13,
            }}>
              <Icon name="search-x" size={20} color="var(--warm-400)" style={{ marginBottom: 10, display: 'block', marginInline: 'auto' }} />
              No matches for &ldquo;{q}&rdquo;
            </div>
          ) : items.map((it, i) => (
            <div key={it.title} className={`acc-item ${open === i ? 'open' : ''}`}
              onClick={() => setOpen(o => o === i ? -1 : i)} data-cursor="hover">
              <div className="acc-head">
                <span className="chev">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="acc-title clamp-2">{it.title}</div>
                  {it.authors && (
                    <div style={{ marginTop: 4, fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--warm-600)' }}>{it.authors}</div>
                  )}
                </div>
                {it.tag && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--usc-garnet)', background: 'rgba(115,0,10,0.08)', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', alignSelf: 'flex-start', marginTop: 2 }}>{it.tag}</span>
                )}
                <span className="acc-meta">{it.meta}</span>
              </div>
              <div className="acc-body">
                <p>{it.abs}</p>
              </div>
            </div>
          ))}
        </GlassCard>
      </Reveal>
    </section>
  );
}

Object.assign(window, { CohortTable, MLPerformance, ReadingLibrary });
