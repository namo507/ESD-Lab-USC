// QA review — the centerpiece. 64 epoch tiles for one visit, click to inspect, accept/reject.
const { useState: useStateQ, useMemo: useMemoQ, useEffect: useEffectQ } = React;

function FlagBadge({ flag, size = 'sm' }) {
  const map = {
    clean:    { kind: 'ok', label: 'clean' },
    ectopic:  { kind: 'warn', label: 'ectopic' },
    motion:   { kind: 'warn', label: 'motion' },
    noise:    { kind: 'fail', label: 'noise' },
    flatline: { kind: 'fail', label: 'flatline' },
  };
  const m = map[flag] || map.clean;
  return <Badge kind={m.kind} size={size}>{m.label}</Badge>;
}

function EpochTile({ ep, selected, onClick, decision }) {
  const sqiColor = ep.sqi > 0.7 ? C.green : ep.sqi > 0.5 ? C.gold : ep.sqi > 0.3 ? '#d97706' : C.red;
  const isAccept = decision === 'accept';
  const isReject = decision === 'reject';
  return (
    <Tooltip
      maxWidth={260}
      text={`Epoch ${ep.idx + 1} · ${ep.t0}–${ep.t1}s · SQI ${ep.sqi.toFixed(2)} · ${ep.flag}${decision !== 'auto' ? ` · ${decision}ed` : ''}`}>
      <div onClick={onClick} style={{
        position: 'relative', cursor: 'pointer',
        background: isReject ? '#faf0f0' : isAccept ? '#f0f7f1' : '#fff',
        border: `1px solid ${selected ? C.ink : isReject ? '#e0b7b9' : isAccept ? '#b9d6c0' : C.s200}`,
        borderRadius: 2, padding: '4px 4px 3px',
        transition: 'border-color 80ms ease',
        height: 56,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = C.s400; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = isReject ? '#e0b7b9' : isAccept ? '#b9d6c0' : C.s200; }}>
        {/* mini ECG */}
        <svg viewBox="0 0 60 30" style={{ width: '100%', height: 30, display: 'block' }}>
          <path d={ecgPath(60, 30, ep.idx + 1, ep.flag)} fill="none"
            stroke={ep.flag === 'clean' ? C.s700 : ep.flag === 'ectopic' ? '#a06000' : ep.flag === 'motion' ? '#a06000' : C.red}
            strokeWidth={0.9} />
        </svg>
        {/* footer: idx + sqi bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 1 }}>
          <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: C.s500 }}>{ep.idx + 1}</span>
          <div style={{ flex: 1, height: 3, background: C.s100, borderRadius: 0 }}>
            <div style={{ width: `${ep.sqi * 100}%`, height: '100%', background: sqiColor }} />
          </div>
        </div>
        {/* decision pip */}
        {decision !== 'auto' && (
          <div style={{
            position: 'absolute', top: 2, right: 2,
            width: 10, height: 10, borderRadius: '50%',
            background: isAccept ? C.green : C.red,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={isAccept ? 'check' : 'x'} size={7} color="#fff" stroke={3} />
          </div>
        )}
      </div>
    </Tooltip>
  );
}

function ScreenQA({ participantId }) {
  const p = window.PARTICIPANTS.find(x => x.id === participantId) || window.PARTICIPANTS[0];
  const [epochs, setEpochs] = useStateQ(() => window.makeEpochs());
  const [selected, setSelected] = useStateQ(0);
  const [filter, setFilter] = useStateQ('all'); // all | flagged | rejected

  const filtered = useMemoQ(() => {
    if (filter === 'all') return epochs;
    if (filter === 'flagged') return epochs.filter(e => e.flag !== 'clean');
    if (filter === 'rejected') return epochs.filter(e => e.decision === 'reject' || e.flag === 'noise' || e.flag === 'flatline');
    return epochs;
  }, [epochs, filter]);

  function setDecision(idx, d) {
    setEpochs(es => es.map((e, i) => i === idx ? { ...e, decision: d } : e));
  }
  function bulkAccept() {
    setEpochs(es => es.map(e => ({ ...e, decision: e.flag === 'clean' || e.flag === 'ectopic' ? 'accept' : e.decision })));
  }
  function bulkReject() {
    setEpochs(es => es.map(e => ({ ...e, decision: (e.flag === 'noise' || e.flag === 'flatline') ? 'reject' : e.decision })));
  }
  function clearAll() {
    setEpochs(es => es.map(e => ({ ...e, decision: 'auto' })));
  }

  // Counts
  const counts = useMemoQ(() => {
    const accepted = epochs.filter(e => e.decision === 'accept' || (e.decision === 'auto' && e.sqi > 0.6)).length;
    const rejected = epochs.filter(e => e.decision === 'reject' || (e.decision === 'auto' && e.sqi < 0.4)).length;
    const review = epochs.length - accepted - rejected;
    return { accepted, rejected, review };
  }, [epochs]);

  const ep = epochs[selected];

  // Keyboard shortcuts
  useEffectQ(() => {
    function onKey(e) {
      if (e.key === 'a' || e.key === 'A') setDecision(selected, 'accept');
      else if (e.key === 'r' || e.key === 'R') setDecision(selected, 'reject');
      else if (e.key === 'ArrowRight') setSelected(s => Math.min(epochs.length - 1, s + 1));
      else if (e.key === 'ArrowLeft') setSelected(s => Math.max(0, s - 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, epochs.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s400, letterSpacing: '.08em', textTransform: 'uppercase' }}>QA review</span>
            <span style={{ color: C.s400 }}>·</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s700 }}>{p.id} · {p.visit}</span>
          </div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 30, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.05 }}>
            <Gloss term="Epoch">Epoch</Gloss>-by-epoch signal review
          </div>
          <div style={{ color: C.s500, fontSize: 13, marginTop: 6, fontFamily: "'Source Serif 4', serif" }}>
            64 epochs · 5 s each · 5 min 20 s of ECG. Press <kbd style={kbdStyle}>A</kbd> accept · <kbd style={kbdStyle}>R</kbd> reject · <kbd style={kbdStyle}>← →</kbd> navigate.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" icon="check" onClick={bulkAccept}>Auto-accept clean</Button>
          <Button variant="secondary" size="md" icon="x" onClick={bulkReject}>Auto-reject bad</Button>
          <Button variant="ghost" size="md" icon="rotate-ccw" onClick={clearAll}>Clear</Button>
          <Button icon="check-check">Save QA decisions</Button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <KPI label="Accepted" value={counts.accepted} unit={`/ ${epochs.length}`} sub="will feed HRV pipeline" />
        <KPI label="Needs review" value={counts.review} sub="0.4 ≤ SQI ≤ 0.6" gloss="SQI" />
        <KPI label="Rejected" value={counts.rejected} sub="excluded from features" />
        <KPI label="Median SQI" value={(epochs.reduce((s, e) => s + e.sqi, 0) / epochs.length).toFixed(2)} sub="signal quality" gloss="SQI" />
        <KPI label="Yield" value={`${((counts.accepted / epochs.length) * 100).toFixed(0)}%`} sub="usable for analysis" delta={counts.accepted >= epochs.length * 0.85 ? 'above target' : 'below target'} deltaKind={counts.accepted >= epochs.length * 0.85 ? 'up' : 'down'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14, alignItems: 'flex-start' }}>
        {/* Epoch grid */}
        <Card pad={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
            <SectionLabel>Epoch grid · 8 × 8</SectionLabel>
            <Segmented size="sm" options={[{value:'all',label:'all'},{value:'flagged',label:'flagged'},{value:'rejected',label:'rejected'}]} value={filter} onChange={setFilter} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {filtered.map(e => (
              <EpochTile key={e.idx} ep={e} selected={selected === e.idx}
                onClick={() => setSelected(e.idx)}
                decision={e.decision} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.s100}`, fontSize: 11, color: C.s500, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: C.green }} /> SQI ≥ 0.7</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: C.gold }} /> 0.5–0.7</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: '#d97706' }} /> 0.3–0.5</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: C.red }} /> &lt; 0.3</span>
            <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>auto-thresh: SQI &lt; 0.4</span>
          </div>
        </Card>

        {/* Detail panel */}
        <Card pad={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionLabel>Epoch {ep.idx + 1}</SectionLabel>
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.s500 }}>{ep.t0}–{ep.t1} s</span>
          </div>
          <div style={{ background: C.ink, borderRadius: 2, padding: '12px 10px', marginTop: 10, position: 'relative' }}>
            <svg viewBox="0 0 320 120" style={{ width: '100%', height: 120, display: 'block' }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <line key={'v' + i} x1={i * 50} y1={0} x2={i * 50} y2={120} stroke="#1f2228" strokeWidth={1} />
              ))}
              {Array.from({ length: 5 }).map((_, i) => (
                <line key={'h' + i} x1={0} y1={i * 30} x2={320} y2={i * 30} stroke="#1f2228" strokeWidth={1} />
              ))}
              <path d={ecgPath(320, 120, ep.idx + 1, ep.flag)} fill="none"
                stroke={ep.flag === 'clean' ? C.green : ep.flag === 'ectopic' ? C.gold : ep.flag === 'motion' ? C.gold : C.red}
                strokeWidth={1.4} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#9a9ea4', fontFamily: "'JetBrains Mono', monospace" }}>
              <span>{ep.t0} s</span><span>{ep.t1} s</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 12 }}>
            <div style={{ padding: '8px 10px', background: C.s50, border: `1px solid ${C.s200}`, borderRadius: 2 }}>
              <div style={{ fontSize: 10, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <Gloss term="SQI">SQI</Gloss>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, marginTop: 2 }}>{ep.sqi.toFixed(2)}</div>
            </div>
            <div style={{ padding: '8px 10px', background: C.s50, border: `1px solid ${C.s200}`, borderRadius: 2 }}>
              <div style={{ fontSize: 10, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <Gloss term="IBI">R-peaks</Gloss>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, marginTop: 2 }}>{ep.ibi_n}</div>
            </div>
            <div style={{ padding: '8px 10px', background: C.s50, border: `1px solid ${C.s200}`, borderRadius: 2 }}>
              <div style={{ fontSize: 10, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Flag</div>
              <div style={{ marginTop: 4 }}><FlagBadge flag={ep.flag} /></div>
            </div>
            <div style={{ padding: '8px 10px', background: C.s50, border: `1px solid ${C.s200}`, borderRadius: 2 }}>
              <div style={{ fontSize: 10, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Decision</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, marginTop: 2, color: ep.decision === 'accept' ? C.green : ep.decision === 'reject' ? C.red : C.s700 }}>
                {ep.decision === 'auto' ? 'pending review' : ep.decision + 'ed'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <Button variant={ep.decision === 'accept' ? 'gold' : 'secondary'} icon="check" onClick={() => setDecision(selected, 'accept')} style={{ flex: 1, justifyContent: 'center' }}>Accept</Button>
            <Button variant={ep.decision === 'reject' ? 'primary' : 'secondary'} icon="x" onClick={() => setDecision(selected, 'reject')} style={{ flex: 1, justifyContent: 'center' }}>Reject</Button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => setSelected(Math.max(0, selected - 1))}>Prev</Button>
            <Button variant="ghost" size="sm" icon="chevron-right" iconRight="chevron-right" onClick={() => setSelected(Math.min(epochs.length - 1, selected + 1))}>Next</Button>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" icon="message-square">Note</Button>
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.s200}` }}>
            <SectionLabel style={{ marginBottom: 8 }}>Why this matters</SectionLabel>
            <div style={{ fontSize: 12, color: C.s700, lineHeight: 1.5 }}>
              {epochExplanation(ep.flag)}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

const kbdStyle = {
  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
  color: C.s700, background: '#fff', border: `1px solid ${C.s300}`,
  padding: '1px 5px', borderRadius: 2, margin: '0 1px',
};

function epochExplanation(flag) {
  switch (flag) {
    case 'clean': return 'Clear R-peaks, low noise floor. Safe to feed into HRV (RMSSD, HF) and HDA labeling. No action needed.';
    case 'ectopic': return 'Premature beat detected. Excluded from RMSSD computation but the epoch is otherwise usable — HRV pipeline interpolates the IBI series before features.';
    case 'motion': return 'Likely infant movement artifact. Baseline wander obscures isoelectric line. Often salvageable after high-pass filtering; review for false R-peaks.';
    case 'noise': return 'Power-line or muscle EMG dominates. R-peak detection is unreliable. Reject — do not include in HRV features.';
    case 'flatline': return 'Lead disconnect or saturation. Reject and check Actiheart-5 contact log. May indicate sensor pop-off mid-visit.';
    default: return '';
  }
}

Object.assign(window, { ScreenQA });
