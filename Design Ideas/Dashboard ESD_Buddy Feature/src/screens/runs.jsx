// Runs — list of pipeline runs + active run with streaming logs + Run a job form.
const { useState: useStateRn, useEffect: useEffectRn, useRef: useRefRn } = React;

const SAMPLE_LOG = [
  { t: '09:12:04', lvl: 'info', msg: '▶ run_2026_115_a started by jbradshaw · scope=auto · n=18 visits' },
  { t: '09:12:05', lvl: 'info', msg: '  config: pipeline.yaml · branch=main · commit=8a3f1c' },
  { t: '09:12:08', lvl: 'info', msg: '[ingest] 18/18 .ecg files located in /raw/2026-04-25/' },
  { t: '09:12:12', lvl: 'ok',   msg: '[ingest] 18 files validated · 1024 Hz · ch I' },
  { t: '09:14:38', lvl: 'info', msg: '[preprocess] 0.5–40 Hz bandpass · Pan-Tompkins R-peak detection' },
  { t: '09:21:14', lvl: 'warn', msg: '[preprocess] NANO-0134 cga_6mo · 60 % epochs flagged motion · proceeding' },
  { t: '09:24:41', lvl: 'ok',   msg: '[preprocess] 18 visits · 1,786 windows · 38 rejected (2.1 %)' },
  { t: '09:26:02', lvl: 'info', msg: '[qa] auto-thresholding @ SQI=0.4 · 1,641 accepted · 145 surfaced for review' },
  { t: '09:41:20', lvl: 'info', msg: '[hrv] computing RMSSD, SDNN, pNN50, LF/HF · 8 workers' },
  { t: '09:48:55', lvl: 'info', msg: '[hrv] 524 / 1,786 windows ...' },
  { t: '09:54:11', lvl: 'info', msg: '[hrv] 847 / 1,786 windows ...' },
  { t: '09:58:02', lvl: 'info', msg: '[hda] queued · awaiting hrv completion' },
];

function ScreenRuns() {
  const [activeId, setActive] = useStateRn(window.RUNS[0].id);
  const [logs, setLogs] = useStateRn(SAMPLE_LOG.slice(0, 8));
  const [scope, setScope] = useStateRn('auto · all visits ready');
  const [showLaunch, setShowLaunch] = useStateRn(false);

  useEffectRn(() => {
    if (logs.length >= SAMPLE_LOG.length) return;
    const t = setTimeout(() => setLogs(SAMPLE_LOG.slice(0, logs.length + 1)), 1400);
    return () => clearTimeout(t);
  }, [logs]);

  const run = window.RUNS.find(r => r.id === activeId) || window.RUNS[0];
  const lvlColor = { info: C.s500, ok: C.green, warn: C.gold, fail: C.red };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s400, letterSpacing: '.08em', textTransform: 'uppercase' }}>Pipeline runs</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 32, fontWeight: 600, marginTop: 4, lineHeight: 1.05 }}>Run history &amp; live logs</div>
          <div style={{ color: C.s500, fontSize: 13, marginTop: 6, fontFamily: "'Source Serif 4', serif" }}>Trigger a run, watch it stream, or replay any past job.</div>
        </div>
        <Button icon="play" onClick={() => setShowLaunch(true)}>Run pipeline</Button>
      </div>

      {showLaunch && (
        <Card pad={20} style={{ background: C.s50, borderColor: C.s300 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <SectionLabel>New run</SectionLabel>
            <button onClick={() => setShowLaunch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <Icon name="x" size={14} color={C.s500} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.s500, marginBottom: 4 }}>Scope</div>
              <input value={scope} onChange={e => setScope(e.target.value)} style={{ width: '100%', font: 'inherit', fontSize: 13, padding: '7px 10px', border: `1px solid ${C.s300}`, borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", background: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.s500, marginBottom: 4 }}>Stages</div>
              <select style={{ width: '100%', font: 'inherit', fontSize: 12, padding: '7px 10px', border: `1px solid ${C.s300}`, borderRadius: 2, background: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
                <option>all stages</option><option>preprocess → hda</option><option>qa only</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.s500, marginBottom: 4 }}>Workers</div>
              <select style={{ width: '100%', font: 'inherit', fontSize: 12, padding: '7px 10px', border: `1px solid ${C.s300}`, borderRadius: 2, background: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
                <option>8 (default)</option><option>4</option><option>16</option>
              </select>
            </div>
            <Button icon="play" onClick={() => { setShowLaunch(false); setLogs(SAMPLE_LOG.slice(0, 1)); }}>Launch</Button>
          </div>
          <div style={{ fontSize: 11, color: C.s500, marginTop: 8 }}>
            HIPAA: only de-identified outputs will be written to <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>data/processed/deidentified/</code>.
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14, alignItems: 'flex-start' }}>
        <Card pad={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.s200}` }}>
            <SectionLabel>Recent runs</SectionLabel>
          </div>
          {window.RUNS.map(r => {
            const sel = r.id === activeId;
            return (
              <div key={r.id} onClick={() => setActive(r.id)}
                style={{ padding: '12px 18px', borderBottom: `1px solid ${C.s100}`, cursor: 'pointer', background: sel ? C.s50 : 'transparent', borderLeft: `2px solid ${sel ? C.garnet : 'transparent'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600 }}>{r.id}</span>
                  <Badge size="sm" kind={r.status === 'done' ? 'ok' : r.status === 'fail' ? 'fail' : r.status === 'running' ? 'info' : 'neutral'}>{r.status}</Badge>
                </div>
                <div style={{ fontSize: 11, color: C.s500, marginTop: 4 }}>{r.scope}</div>
                <div style={{ fontSize: 10, color: C.s400, marginTop: 4, fontFamily: "'JetBrains Mono', monospace", display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.triggered}</span><span>{r.duration}</span>
                </div>
              </div>
            );
          })}
        </Card>

        <Card pad={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.s200}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <SectionLabel>{run.id} · {run.scope}</SectionLabel>
              <div style={{ fontSize: 12, color: C.s500, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>by {run.actor} · stage {run.stage} · {run.duration}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="secondary" size="sm" icon="rotate-ccw">Replay</Button>
              <Button variant="danger" size="sm" icon="square">Stop</Button>
            </div>
          </div>
          <div style={{ background: C.ink, padding: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.55, color: '#e8e6e2', maxHeight: 460, overflow: 'auto' }}>
            {logs.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 50px 1fr', gap: 10 }}>
                <span style={{ color: '#6b7076' }}>{l.t}</span>
                <span style={{ color: lvlColor[l.lvl], fontWeight: 600 }}>{l.lvl.toUpperCase()}</span>
                <span>{l.msg}</span>
              </div>
            ))}
            {logs.length < SAMPLE_LOG.length && run.status === 'running' && (
              <div style={{ color: C.blue, marginTop: 6 }}>
                <span className="pulse-dot" style={{ display: 'inline-block', width: 6, height: 6, background: C.blue, borderRadius: '50%', marginRight: 6 }} />
                streaming...
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenRuns });
