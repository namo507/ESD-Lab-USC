// Buddy — friendly animated SVG figure with speech bubble that pops up
// whenever the mouse hovers any element bearing `data-insight`.
// Also exports SectionTweak — a small gear button + tray for per-section toggles.
const { useState: useSb, useEffect: useEb, useRef: useRb } = React;

// ============================================================
// INSIGHT LIBRARY — keyed by tile id, surfaces curated metadata.
// Anything not in this map falls back to the raw data-insight text.
// ============================================================
const INSIGHTS = {
  'kpi-enroll': { term: 'Enrollment', body: "231 of 260 infants enrolled. We're tracking ASIB, VPT, and TD cohorts in parallel — 4 new joined this week." },
  'kpi-epochs': { term: 'Epochs', body: "Each epoch is a 5-second window of ECG. Yesterday the pipeline processed 1,824 of them, +312 over the prior 24 h." },
  'kpi-rmssd':  { term: 'RMSSD',  body: "Root-mean-square of successive IBI differences — the classic vagal-tone marker. Cohort median sits at 38.4 ms ±0.6." },
  'kpi-redcap': { term: 'REDCap', body: "99.8 % sync rate over 24 h with zero PHI leaks. PHI columns are stripped at the proxy before any export." },
  'kpi-auroc':  { term: 'Model',  body: "Held-out AUROC of 0.899 on a participant-stratified 20 % split. SHAP confirms HDA-derived features dominate." },
  'aim-01': { term: 'Aim 1', body: "Tests whether HDA maturation diverges across ASIB, VPT, TD between 1 and 3 months. ASIBs are predicted to start typical and attenuate." },
  'aim-02': { term: 'Aim 2', body: "Tests moment-to-moment HDA × behavior coupling at 6, 9, 12 months. Coupling weakens in ASIBs as early symptoms emerge." },
  'aim-03': { term: 'Aim 3', body: "Machine-learning biomarker — uses Aim 1 + Aim 2 features to predict ASD symptoms at age 3." },
  'stage-ingest':     { term: 'Ingest',     body: "Raw .ecg files land in encrypted S3 from the chest-worn Actiheart-5. 1024 Hz, single-lead, continuous." },
  'stage-preprocess': { term: 'Preprocess', body: "0.5–40 Hz bandpass + Pan-Tompkins R-peak detection. Windows with >20 % ectopic beats are dropped before HRV." },
  'stage-qa':         { term: 'Window QA',  body: "Signal Quality Index 0–1 per epoch. <0.4 auto-rejects; 0.4–0.6 surfaces for human review." },
  'stage-hrv':        { term: 'HRV',        body: "Time- and frequency-domain features per window: RMSSD, SDNN, pNN50, LF, HF, LF/HF." },
  'stage-hda':        { term: 'HDA',        body: "Heart-rate Defined Attention phases: orienting · sustained · inattention · termination." },
  'stage-export':     { term: 'Export',     body: "Drops DOB, MRN, name, address. Writes hash-keyed parquet to data/processed/deidentified/." },
  'gauge':            { term: 'Risk gauge', body: "Live recompute against the trained classifier. Drag any slider on the left — the gauge animates in real time." },
  'confmat':          { term: 'Confusion matrix', body: "Threshold @ 0.42. TP 38, FN 4, FP 9, TN 181 on the held-out validation split." },
  'roc':              { term: 'ROC',        body: "Receiver operating characteristic on the held-out split. AUROC 0.899. The dashed diagonal is chance." },
  'shap':             { term: 'SHAP',       body: "Feature attribution averaged over the held-out cohort. HDA-derived features (sustained %, 3-mo RMSSD) lead." },
  'cohort-table':     { term: 'Cohort',     body: "10 participants visible. Click any column to sort. Right-aligned numerics, QC pills colored by status." },
  'pipeline-svg':     { term: 'Pipeline',   body: "Six stages from heartbeat to manuscript. Garnet particles travel along active edges." },
  'arch-stack':       { term: 'Architecture', body: "Glass slabs in 3D. The active layer pulls forward; the cursor drifts the whole stack ±10° on Y." },
  'training':         { term: 'Training',   body: "Three stages — train on 80% stratified by group, validate on a held-out 20% by participant, calibrate per-cohort with Platt scaling." },
  'feature-bar':      { term: 'Features',   body: "24 total features feed the classifier. HRV (12) and HDA (6) carry most of the model's signal." },
  'insights-feed':    { term: 'QA agent',   body: "An LLM surveils REDCap, QA flags, and run output — surfacing alerts, warnings, and the small things that need a human." },
  'flow-list':        { term: 'Flow',       body: "Last 4 hours of visit activity across all three sites. Hover a row for a chevron — click to drill in." },
  'reading-library':  { term: 'Library',    body: "Four anchor readings. Click any title to expand the abstract." },
};

// ============================================================
// SVG character. Two parts: head (round body), eyes (track pointer),
// and a small antenna that flicks when "talking".
// ============================================================
function BuddySvg({ talking, lookX, lookY }) {
  // eye centers in viewBox coords
  const eyeL = { cx: 36, cy: 50 }, eyeR = { cx: 60, cy: 50 };
  // Constrain pupil offset
  const off = (dx, dy) => {
    const len = Math.sqrt(dx * dx + dy * dy);
    const max = 2.4;
    if (len < 1) return { x: 0, y: 0 };
    return { x: (dx / len) * Math.min(max, len * 0.04), y: (dy / len) * Math.min(max, len * 0.04) };
  };
  const oL = off(lookX - eyeL.cx, lookY - eyeL.cy);
  const oR = off(lookX - eyeR.cx, lookY - eyeR.cy);
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      {/* antenna */}
      <g style={{ transformOrigin: '48px 18px' }}>
        <path className="antenna" d="M48 22 Q 50 14 55 8" />
        <circle className="antenna-dot" cx="55" cy="8" r="3" />
      </g>
      {/* body */}
      <ellipse className="body" cx="48" cy="56" rx="32" ry="28" />
      {/* blush */}
      <circle className="blush" cx="22" cy="62" r="5" />
      <circle className="blush" cx="74" cy="62" r="5" />
      {/* eyes — pupils translate toward cursor */}
      <g className="eye" style={{ transform: `translate(${oL.x.toFixed(2)}px, ${oL.y.toFixed(2)}px)` }}>
        <circle cx={eyeL.cx} cy={eyeL.cy} r="3" />
      </g>
      <g className="eye" style={{ transform: `translate(${oR.x.toFixed(2)}px, ${oR.y.toFixed(2)}px)` }}>
        <circle cx={eyeR.cx} cy={eyeR.cy} r="3" />
      </g>
      {/* mouth — flat smile when idle, open oval when talking */}
      {talking ? (
        <ellipse cx="48" cy="66" rx="5" ry="3.5" fill="var(--ink)" />
      ) : (
        <path className="mouth" d="M 42 64 Q 48 68 54 64" />
      )}
      {/* heart pulse — appears when talking */}
      <g style={{ transformOrigin: '78px 38px' }}>
        <path className="heart-pulse" transform="translate(72 32) scale(0.42)"
          d="M12 21s-7-4.5-9.5-9.2C.7 8.5 2.3 5 5.5 5c1.9 0 3.6 1 4.5 2.5C10.9 6 12.6 5 14.5 5c3.2 0 4.8 3.5 3 6.8C19 16.5 12 21 12 21z" />
      </g>
    </svg>
  );
}

// ============================================================
// BuddyController — singleton listener
// ============================================================
function Buddy() {
  const [insight, setInsight] = useSb(null); // { term, body }
  const [hidden, setHidden]   = useSb(false);
  const [look, setLook]       = useSb({ x: 48, y: 48 });
  const buddyRef = useRb(null);
  const hideTimerRef = useRb(null);

  useEb(() => {
    function onOver(e) {
      const target = e.target.closest('[data-insight]');
      if (!target) return;
      const id = target.getAttribute('data-insight');
      const next = INSIGHTS[id] || { term: 'Insight', body: id };
      clearTimeout(hideTimerRef.current);
      setInsight(next);
      target.classList.add('insight-active');
    }
    function onOut(e) {
      const target = e.target.closest('[data-insight]');
      if (!target) return;
      target.classList.remove('insight-active');
      hideTimerRef.current = setTimeout(() => setInsight(null), 600);
    }
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout',  onOut,  { passive: true });
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout',  onOut);
    };
  }, []);

  // Pupil-tracking — follows cursor when buddy is visible.
  useEb(() => {
    function onMove(e) {
      const el = buddyRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // Map to viewBox coordinates (96×96), centered at 48,48 + a tug toward cursor.
      const dx = (e.clientX - cx);
      const dy = (e.clientY - cy);
      setLook({ x: 48 + Math.max(-200, Math.min(200, dx)), y: 48 + Math.max(-200, Math.min(200, dy)) });
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  if (hidden) return null;

  return (
    <div className="buddy-stage" aria-live="polite">
      <div className={`buddy ${insight ? 'talking' : ''}`} ref={buddyRef}
        onClick={() => setHidden(true)} title="Click to hide"
        data-cursor="hover">
        <BuddySvg talking={!!insight} lookX={look.x} lookY={look.y} />
      </div>
      <div className={`bubble ${insight ? 'show' : ''}`}>
        {insight && (
          <>
            <span className="term-tag">{insight.term}</span>
            <div className="body-text">{insight.body}</div>
          </>
        )}
        {!insight && (
          <div className="body-text" style={{ color: 'var(--warm-500)' }}>
            Hover any tile and I'll explain it.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SectionTweak — a small gear button + tray for per-section toggles.
// Pass `rows` = [{ key, label, desc, options: [{value, label}], value, onChange }]
// ============================================================
function SectionTweak({ rows = [] }) {
  const [open, setOpen] = useSb(false);
  const ref = useRb(null);
  useEb(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <span className="tweak-wrap" ref={ref}>
      <button className={`tweak-gear ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}
        aria-label="Section tweaks" data-cursor="hover">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <div className={`tweak-tray ${open ? 'open' : ''}`}>
        {rows.map(r => (
          <div key={r.key} className="row">
            <span className="lbl">{r.label}</span>
            {r.desc && <span className="desc">{r.desc}</span>}
            <div className="opts">
              {r.options.map(o => (
                <button key={o.value}
                  className={r.value === o.value ? 'on' : ''}
                  onClick={() => r.onChange(o.value)}
                  data-cursor="hover">{o.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </span>
  );
}

Object.assign(window, { Buddy, SectionTweak, INSIGHTS });
