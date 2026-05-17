// Hero scene — editorial title, breathing eyebrow chip, live ECG waveform ribbon.
const { useState: useSh, useEffect: useEh, useRef: useRh, useMemo: useMh } = React;

// Realistic-ish ECG-ribbon generator. Returns SVG path d for a wide waveform.
function ecgRibbon(W, H, beats = 12, seed = 5) {
  const pts = [];
  const beatW = W / beats;
  const mid = H / 2;
  for (let x = 0; x <= W; x += 1) {
    const phase = (x % beatW) / beatW;
    let y = mid + Math.sin(x * 0.02 + seed) * 1.2;
    if (phase > 0.42 && phase < 0.5)      y -= ((phase - 0.42) / 0.08) * 4;
    else if (phase >= 0.5 && phase < 0.55) y -= ((phase - 0.5) / 0.05) * (H * 0.35) - 4;
    else if (phase >= 0.55 && phase < 0.62) y -= ((0.62 - phase) / 0.07) * (H * 0.35);
    else if (phase >= 0.7 && phase < 0.82) y += Math.sin((phase - 0.7) / 0.12 * Math.PI) * 4;
    pts.push([x, Math.max(4, Math.min(H - 4, y))]);
  }
  return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1].toFixed(2)).join(' ');
}

function HeroWaveform() {
  const W = 1500, H = 110;
  const d = useMh(() => ecgRibbon(W, H, 14, 7), []);
  return (
    <div className="hero-waveform">
      <div className="lane-label">
        <div className="t-eyebrow" style={{ color: 'var(--warm-600)' }}>Lead I · 1024 Hz · live</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="ecg-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--usc-garnet)" stopOpacity="0.0" />
            <stop offset="6%" stopColor="var(--usc-garnet)" stopOpacity="0.5" />
            <stop offset="50%" stopColor="var(--usc-garnet)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--usc-garnet)" stopOpacity="0" />
          </linearGradient>
          <filter id="ecg-glow" x="-2%" y="-50%" width="104%" height="200%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        {/* gridlines */}
        {Array.from({ length: 15 }).map((_, i) => (
          <line key={i} x1={i * 100} y1={0} x2={i * 100} y2={H} stroke="rgba(0,0,0,0.04)" strokeWidth="1" />
        ))}
        {/* glow underlay */}
        <path d={d} fill="none" stroke="var(--usc-garnet)" strokeWidth="3" opacity="0.35" filter="url(#ecg-glow)" />
        {/* clean line */}
        <path d={d} fill="none" stroke="url(#ecg-line)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {/* scanning highlight that travels left→right */}
        <rect x="0" y="0" width="220" height={H} fill="url(#scan-grad)" opacity="0.65">
          <animate attributeName="x" from="-220" to={W} dur="6s" repeatCount="indefinite" />
        </rect>
        <defs>
          <linearGradient id="scan-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,204,0,0)" />
            <stop offset="80%" stopColor="rgba(255,204,0,0.18)" />
            <stop offset="100%" stopColor="rgba(255,204,0,0)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function Hero({ onAssistant }) {
  return (
    <section className="hero">
      <div className="reveal in">
        <div className="hero-eyebrow">
          <span className="pulse-dot" />
          <span className="t-eyebrow" style={{ color: 'var(--warm-700)' }}>Live · NANO pipeline · 14 epochs in flight</span>
        </div>
      </div>

      <h1 className="t-display hero-title">
        <CharRise text="The heartbeat" />
        <br />
        <CharRise text="of every baby's" />
        <br />
        <CharRise text="first year." italicMatch={/first/i} />
      </h1>

      <div className="hero-meta stagger-children">
        <div className="hero-meta-stat" style={{ '--i': 8 }}>
          <span className="hero-meta-label">Infants enrolled</span>
          <span className="hero-meta-num"><Counter to={231} /><small>&thinsp;/ 260</small></span>
        </div>
        <div className="hero-meta-stat" style={{ '--i': 9 }}>
          <span className="hero-meta-label">Median <Gloss term="RMSSD">RMSSD</Gloss></span>
          <span className="hero-meta-num"><Counter to={38.4} decimals={1} /><small>&thinsp;ms</small></span>
        </div>
        <div className="hero-meta-stat" style={{ '--i': 10 }}>
          <span className="hero-meta-label">Epochs · 24h</span>
          <span className="hero-meta-num"><Counter to={1824} formatter={v => Math.round(v).toLocaleString()} /></span>
        </div>
        <div className="hero-meta-stat" style={{ '--i': 11 }}>
          <span className="hero-meta-label">PHI leaks · 7d</span>
          <span className="hero-meta-num"><Counter to={0} /><small>&thinsp;all clear</small></span>
        </div>
      </div>

      {/* Right-side glass card with study context */}
      <GlassCard className="hero-card-right reveal" style={{ animationDelay: '600ms' }}>
        <div className="t-eyebrow" style={{ display: 'inline-block', marginBottom: 8 }}>About the study</div>
        <div className="t-h3" style={{ marginBottom: 8 }}>
          <Gloss term="NANO">NANO</Gloss> — neurodevelopment, gently observed
        </div>
        <p className="t-body" style={{ fontSize: 13.5, margin: 0 }}>
          A 5-year longitudinal study of <Gloss term="VPT">260 very preterm infants</Gloss>, tracking heart-rate
          variability and attention from <Gloss term="CGA">NICU discharge through CGA 24 mo</Gloss>.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Magnetic strength={0.25}>
            <button className="nav-cta" data-cursor="hover" onClick={onAssistant} style={{ background: 'var(--usc-garnet)' }}>
              <Icon name="sparkles" size={13} color="var(--usc-gold)" /> Ask the lab
            </button>
          </Magnetic>
          <Magnetic strength={0.25}>
            <button className="nav-cta" data-cursor="hover" style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid rgba(0,0,0,0.12)' }} onClick={() => document.getElementById('aims')?.scrollIntoView({ behavior: 'smooth' })}>
              <Icon name="arrow-down" size={13} /> Explore aims
            </button>
          </Magnetic>
        </div>
      </GlassCard>

      <HeroWaveform />
      <Hero3DHeart />
    </section>
  );
}

Object.assign(window, { Hero });
