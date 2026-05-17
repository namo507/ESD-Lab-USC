// v4 scenes B: Model Studio — interactive prediction, training stages, feature attribution.
const { useState: useS5, useMemo: useM5, useEffect: useE5, useRef: useR5 } = React;

// ============================================================
// Gauge — semicircular AUROC-style dial, animated to current p.
// ============================================================
function Gauge({ value, label }) {
  // value: 0–1 probability
  const W = 240, H = 140;
  const cx = W / 2, cy = 124, r = 96;
  // Arc background: 180° → 0°
  function arcD(start, end) {
    const sx = cx + r * Math.cos(Math.PI - (Math.PI * start));
    const sy = cy - r * Math.sin(Math.PI - (Math.PI * start));
    const ex = cx + r * Math.cos(Math.PI - (Math.PI * end));
    const ey = cy - r * Math.sin(Math.PI - (Math.PI * end));
    const largeArc = end - start > 0.5 ? 1 : 0;
    return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
  }

  const v = Math.max(0, Math.min(1, value));
  const band = v < 0.33 ? 'low' : v < 0.66 ? 'mid' : 'high';
  const bandLabel = v < 0.33 ? 'lower risk' : v < 0.66 ? 'monitor' : 'elevated risk';
  const bandColor = v < 0.33 ? '#55A868' : v < 0.66 ? '#d18a3a' : '#C44E52';

  return (
    <div className="gauge-wrap">
      <svg className="gauge-svg" viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="#55A868" />
            <stop offset="50%" stopColor="#d18a3a" />
            <stop offset="100%" stopColor="#C44E52" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={arcD(0, 1)} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="18" strokeLinecap="round" />
        {/* Active */}
        <path d={arcD(0, v)} fill="none" stroke="url(#gauge-grad)" strokeWidth="18" strokeLinecap="round" style={{ transition: 'd 400ms var(--ease-soft)' }} />
        {/* Tick at value */}
        {(() => {
          const tx = cx + r * Math.cos(Math.PI - (Math.PI * v));
          const ty = cy - r * Math.sin(Math.PI - (Math.PI * v));
          return (
            <>
              <circle cx={tx} cy={ty} r={10} fill="#fff" stroke={bandColor} strokeWidth="3" />
            </>
          );
        })()}
        {/* min/max labels */}
        <text x={cx - r} y={cy + 24} textAnchor="middle" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: 'var(--warm-500)' }}>0.0</text>
        <text x={cx + r} y={cy + 24} textAnchor="middle" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: 'var(--warm-500)' }}>1.0</text>
      </svg>
      <div className="v">{(v * 100).toFixed(1)}<span style={{ fontSize: '0.4em', color: 'var(--warm-500)' }}>%</span></div>
      <div className="lbl">{label}</div>
      <div className={`v-band ${band}`}>{bandLabel}</div>
    </div>
  );
}

// ============================================================
// Slider row — controlled range input with live value display.
// ============================================================
function SliderRow({ s, value, onChange }) {
  const p = ((value - s.min) / (s.max - s.min)) * 100;
  return (
    <div className="slider-row">
      <div className="slider-label">
        <div className="name">
          {s.gloss ? <Gloss term={s.gloss}><span className="l">{s.label}</span></Gloss> : <span className="l">{s.label}</span>}
        </div>
        <input
          type="range" className="esd-slider"
          min={s.min} max={s.max} step={s.step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ '--p': `${p}%` }}
          data-cursor="hover"
        />
      </div>
      <div className="slider-value">{value.toFixed(s.step < 1 ? 1 : 0)}</div>
    </div>
  );
}

// ============================================================
// Model Studio
// ============================================================
function ModelStudio() {
  // Initialize feature inputs from defaults
  const initial = useM5(() => {
    const out = {};
    for (const s of window.ESD2_SLIDER_INPUTS) out[s.id] = s.default;
    return out;
  }, []);
  const [vals, setVals] = useS5(initial);

  // Compute prediction as a logistic over weighted normalized deltas.
  // Each slider has a weight; positive weight => increases risk, negative => decreases.
  // We normalize each feature against its (min, max) and use a baseline of 0.36
  // so default sliders land near 0.34 risk (low-but-monitorable).
  const p = useM5(() => {
    const baseline = -0.55;
    let z = baseline;
    for (const s of window.ESD2_SLIDER_INPUTS) {
      const v = vals[s.id];
      const mid = (s.min + s.max) / 2;
      const span = (s.max - s.min) / 2;
      const norm = (v - mid) / span; // -1 .. +1
      z += norm * (s.weight || 0) * 5;
    }
    return 1 / (1 + Math.exp(-z));
  }, [vals]);

  function reset() { setVals(initial); }

  function nudgeTo(preset) {
    // Preset: 'low', 'mid', 'high'
    const out = {};
    for (const s of window.ESD2_SLIDER_INPUTS) {
      const sign = (s.weight || 0) >= 0 ? 1 : -1;
      let target = (s.min + s.max) / 2;
      if (preset === 'low')  target = sign > 0 ? s.min + (s.max - s.min) * 0.18 : s.min + (s.max - s.min) * 0.85;
      if (preset === 'high') target = sign > 0 ? s.min + (s.max - s.min) * 0.85 : s.min + (s.max - s.min) * 0.15;
      out[s.id] = target;
    }
    setVals(out);
  }

  const m = window.ESD2_MODEL;

  return (
    <section className="scene" id="studio">
      <div className="scene-header">
        <div className="left flex-min">
          <span className="t-eyebrow">Model studio · Aim 3 classifier</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>What if you adjust the infant's data?</h2>
          <p className="t-body">
            <Gloss term="HDA">Autonomic regulation</Gloss> features feed a gradient-boosted classifier predicting
            ASD symptoms at age 3. Drag the sliders, watch the gauge respond. This is illustrative — actual model
            inference runs server-side against the trained <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{m.name}</code>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="seg-item" onClick={() => nudgeTo('low')} data-cursor="hover" style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--glass-stroke-soft)', borderRadius: 999, fontSize: 12 }}>Low-risk preset</button>
          <button className="seg-item" onClick={() => nudgeTo('high')} data-cursor="hover" style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--glass-stroke-soft)', borderRadius: 999, fontSize: 12 }}>High-risk preset</button>
          <button className="seg-item" onClick={reset} data-cursor="hover" style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--glass-stroke-soft)', borderRadius: 999, fontSize: 12 }}>Reset</button>
        </div>
      </div>

      <div className="studio-grid">
        <Reveal>
          <GlassCard style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div className="flex-min">
                <span className="t-eyebrow">Input features</span>
                <div className="t-h3" style={{ marginTop: 4 }}>Per-infant predictors</div>
              </div>
              <span className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)' }}>{window.ESD2_SLIDER_INPUTS.length} of {m.features_in}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {window.ESD2_SLIDER_INPUTS.map(s => (
                <SliderRow key={s.id} s={s} value={vals[s.id]}
                  onChange={v => setVals(prev => ({ ...prev, [s.id]: v }))} />
              ))}
            </div>
            <div className="model-card-strip">
              <div className="metric-tile"><span className="lbl">AUROC</span><span className="v">{m.metrics.auroc.toFixed(3)}</span></div>
              <div className="metric-tile"><span className="lbl">F1</span><span className="v">{m.metrics.f1.toFixed(3)}</span></div>
              <div className="metric-tile"><span className="lbl">Calibration (ECE)</span><span className="v">{m.metrics.ece.toFixed(3)}</span></div>
              <div className="metric-tile"><span className="lbl">Brier</span><span className="v">{m.metrics.brier.toFixed(3)}</span></div>
            </div>
          </GlassCard>
        </Reveal>

        <Reveal delay={120}>
          <GlassCard style={{ padding: '8px 8px 22px', display: 'flex', flexDirection: 'column' }} data-insight="gauge">
            <Gauge value={p} label="P(ASD symptoms @ age 3)" />
            <div style={{ padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16, marginTop: 8 }}>
              <div>
                <div className="t-eyebrow">Model</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, marginTop: 2 }}>{m.name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="t-eyebrow">Trained on</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--warm-600)', marginTop: 2 }}>{m.trained_on}</div>
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </div>

      {/* Training stages */}
      <Reveal>
        <GlassCard style={{ marginTop: 18, padding: '24px 28px' }} data-insight="training">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
            <div>
              <span className="t-eyebrow">How it's built</span>
              <div className="t-h3" style={{ marginTop: 4 }}>Training pipeline</div>
            </div>
            <span className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)' }}>{m.algorithm}</span>
          </div>
          <div className="train-stages">
            <div className="train-stage">
              <div className="n">Stage 1 · Train</div>
              <h4>Stratified gradient boosting</h4>
              <p>80% of visits, stratified by group (ASIB / VPT / TD) and outcome. 5-fold cross-validation drives hyperparameter search.</p>
            </div>
            <div className="train-stage">
              <div className="n">Stage 2 · Validate</div>
              <h4>Held-out 20% by participant</h4>
              <p>No leakage across visits of the same infant. Reports group-stratified AUROC, F1, and calibration on the holdout split.</p>
            </div>
            <div className="train-stage">
              <div className="n">Stage 3 · Calibrate</div>
              <h4>Platt scaling per group</h4>
              <p>Probabilities are recalibrated per cohort. ECE = {m.metrics.ece.toFixed(3)} after calibration. Brier {m.metrics.brier.toFixed(3)}.</p>
            </div>
          </div>
        </GlassCard>
      </Reveal>

      {/* Feature attribution */}
      <Reveal delay={80}>
        <GlassCard style={{ marginTop: 18, padding: '24px 28px' }} data-insight="feature-bar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
            <div>
              <span className="t-eyebrow">Feature attribution</span>
              <div className="t-h3" style={{ marginTop: 4 }}>Where the classifier's weight lives</div>
            </div>
            <span className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)' }}>{m.features_in} features total</span>
          </div>
          {/* Stacked horizontal bar */}
          {(() => {
            const total = m.feature_groups.reduce((s, g) => s + g.count, 0);
            return (
              <>
                <div style={{ display: 'flex', height: 28, borderRadius: 12, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.5)' }}>
                  {m.feature_groups.map(g => (
                    <Tooltip key={g.id} text={`${g.label}: ${g.count} features (${((g.count / total) * 100).toFixed(0)}%)`}>
                      <div data-cursor="hover" style={{
                        width: `${(g.count / total) * 100}%`,
                        background: g.color, height: 28,
                        transition: 'opacity 200ms var(--ease-soft)',
                      }} />
                    </Tooltip>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 14, fontSize: 12, color: 'var(--warm-700)' }}>
                  {m.feature_groups.map(g => (
                    <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, background: g.color, borderRadius: 3 }} />
                      <span>{g.label}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--warm-500)' }}>{g.count}</span>
                    </span>
                  ))}
                </div>
              </>
            );
          })()}
        </GlassCard>
      </Reveal>
    </section>
  );
}

Object.assign(window, { ModelStudio });
