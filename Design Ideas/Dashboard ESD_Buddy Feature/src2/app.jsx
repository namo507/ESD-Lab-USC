// Main app for the warm ESD Lab Dashboard.
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;

const TWEAK_DEFAULS = /*EDITMODE-BEGIN*/{
  "accent": "garnet",
  "dagDots": "flowing",
  "density": "cozy"
}/*EDITMODE-END*/;

// ===== Sidebar =====
const NAV_GROUPS = [
  {
    id: 'ops', title: 'Lab Operations',
    items: [
      { id: 'overview',  label: 'Overview',                  icon: 'layout-dashboard' },
      { id: 'team',      label: 'Our Team',                  icon: 'users' },
      { id: 'intake',    label: 'Intakes & Stories',         icon: 'heart-handshake' },
    ],
  },
  {
    id: 'studies', title: 'Active Studies',
    items: [
      { id: 'nano',      label: 'NANO Study',                icon: 'activity', active: true, badge: 231 },
      { id: 'home',      label: 'Home Study',                icon: 'home' },
      { id: 'fiscal',    label: 'FiSCAL-ASD',                icon: 'baby' },
    ],
  },
  {
    id: 'data', title: 'Data Infrastructure',
    items: [
      { id: 'pipeline',  label: 'Clinical Pipeline',         icon: 'git-branch' },
      { id: 'redcap',    label: 'REDCap Sync',               icon: 'refresh-cw' },
      { id: 'resources', label: 'Resources & Referrals',     icon: 'link-2' },
    ],
  },
];

function Sidebar({ active, setActive }) {
  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: '#ffffff',
      borderRight: '1px solid #ececea',
      padding: '20px 14px',
      display: 'flex', flexDirection: 'column', gap: 24,
      position: 'sticky', top: 0, alignSelf: 'flex-start',
      height: '100vh', overflowY: 'auto',
    }}>
      <div style={{ padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #73000a 0%, #a51124 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontFamily: '"Source Serif 4", serif', fontWeight: 700, fontSize: 18,
            boxShadow: '0 4px 12px rgba(115,0,10,0.25)',
          }}>e</div>
          <div>
            <div style={{ fontFamily: '"Source Serif 4", serif', fontSize: 15, fontWeight: 600, color: '#1c1a18', letterSpacing: '-0.01em' }}>ESD Lab</div>
            <div style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: '#9c9893', letterSpacing: '0.04em' }}>UofSC · IMB</div>
          </div>
        </div>
      </div>

      {NAV_GROUPS.map(g => (
        <div key={g.id}>
          <div style={{ padding: '0 8px 8px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9c9893' }}>
            {g.title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {g.items.map(it => {
              const sel = active === it.id;
              return (
                <button key={it.id} onClick={() => setActive(it.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    border: 'none', background: sel ? '#fae8ea' : 'transparent',
                    color: sel ? '#73000a' : '#3d3a36',
                    fontSize: 13, fontWeight: sel ? 600 : 400,
                    fontFamily: 'Inter, sans-serif', textAlign: 'left',
                    cursor: 'pointer', position: 'relative',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f6f4ef'; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                  {sel && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, borderRadius: 2, background: '#73000a' }} />}
                  <i data-lucide={it.icon} style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.badge && (
                    <span style={{
                      fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
                      background: sel ? '#73000a' : '#ededeb',
                      color: sel ? '#fff' : '#6f6b66',
                      padding: '1px 6px', borderRadius: 999,
                    }}>{it.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 'auto', padding: 12, background: '#f6f4ef', borderRadius: 12, fontSize: 11, color: '#6f6b66', lineHeight: 1.5 }}>
        <div style={{ fontFamily: '"Source Serif 4", serif', fontSize: 13, color: '#3d3a36', fontWeight: 600, marginBottom: 4 }}>Dr. Bradshaw's lab</div>
        Institute for Mind &amp; Brain<br/>1800 Gervais St · Columbia, SC
      </div>
    </aside>
  );
}

// ===== Header =====
function Header({ onSync, syncing, query, setQuery }) {
  const [now, setNow] = useStateA(new Date());
  useEffectA(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <header style={{
      padding: '20px 32px',
      borderBottom: '1px solid #ececea',
      background: 'rgba(255,255,255,0.78)',
      backdropFilter: 'blur(12px)',
      position: 'sticky', top: 0, zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <h1 style={{ margin: 0, fontFamily: '"Source Serif 4", serif', fontSize: 22, fontWeight: 600, color: '#1c1a18', letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Early Social Development Lab
        </h1>
        <div style={{ fontSize: 12, color: '#6f6b66', marginTop: 2, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Institute for Mind and Brain · 1800 Gervais Street, Columbia SC
        </div>
      </div>

      {/* search */}
      <div style={{
        position: 'relative', flex: '0 1 320px', minWidth: 180,
        background: '#f6f4ef', border: '1px solid #ededeb',
        borderRadius: 999, padding: '8px 14px 8px 36px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <i data-lucide="sparkles" style={{ position: 'absolute', left: 12, width: 14, height: 14, strokeWidth: 1.5, color: '#73000a' }} />
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Ask the lab · NANO-0173 RMSSD trend?"
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            font: 'inherit', fontSize: 13, color: '#1c1a18', flex: 1,
            fontFamily: 'Inter, sans-serif',
          }} />
        <span style={{ fontSize: 9, fontFamily: '"JetBrains Mono", monospace', color: '#9c9893', background: '#fff', border: '1px solid #ededeb', padding: '1px 5px', borderRadius: 3 }}>⌘K</span>
      </div>

      {/* clock */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, fontWeight: 500, color: '#1c1a18', letterSpacing: '0.02em' }}>{time}</div>
        <div style={{ fontSize: 11, color: '#6f6b66', fontFamily: 'Inter, sans-serif' }}>{date}</div>
      </div>

      {/* force sync */}
      <button onClick={onSync} disabled={syncing}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 16px', borderRadius: 999,
          background: syncing ? '#3d3a36' : '#73000a',
          color: '#fff', border: 'none',
          fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500,
          cursor: syncing ? 'wait' : 'pointer',
          boxShadow: '0 4px 14px rgba(115,0,10,0.25)',
          transition: 'background 120ms ease',
        }}>
        <i data-lucide="refresh-cw" style={{ width: 14, height: 14, strokeWidth: 1.8, animation: syncing ? 'esd-spin 0.7s linear infinite' : 'none' }} />
        {syncing ? 'syncing…' : 'Force Sync'}
      </button>
    </header>
  );
}

// ===== HIPAA banner =====
function HipaaBanner() {
  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(115,0,10,0.08) 0%, rgba(115,0,10,0.02) 100%)',
      borderBottom: '1px solid rgba(115,0,10,0.15)',
      padding: '8px 32px',
      display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 12, color: '#5a3033', fontFamily: 'Inter, sans-serif',
    }}>
      <i data-lucide="shield-check" style={{ width: 14, height: 14, strokeWidth: 1.5, color: '#73000a' }} />
      <span>
        <Gloss term="PHI">PHI</Gloss> processing zone · <Gloss term="HIPAA">HIPAA</Gloss>-compliant audit logging is active.
        All exports are stripped of identifiers via <Gloss term="REDCap">REDCap</Gloss> proxy.
      </span>
      <span style={{ marginLeft: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#9c9893' }}>
        IRB Pro00115234 · session · 28 m
      </span>
    </div>
  );
}

// ===== QA Insights panel =====
function QAInsightsPanel({ syncTick }) {
  return (
    <div style={{
      background: 'linear-gradient(160deg, #1c1a18 0%, #2a2622 100%)',
      borderRadius: 24,
      padding: '24px 26px',
      color: '#e8e6e2',
      boxShadow: '0 12px 40px rgba(28,26,24,0.18)',
      position: 'relative', overflow: 'hidden',
      minHeight: 320,
    }}>
      {/* ambient glow */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(255,204,0,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffcc00', boxShadow: '0 0 12px rgba(255,204,0,0.7)' }} />
              <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#ffcc00', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Agentic QA · live</span>
            </div>
            <div style={{ fontFamily: '"Source Serif 4", serif', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Insights from the pipeline</div>
            <div style={{ fontSize: 12, color: '#9c9893', marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
              An LLM agent surveils run output, REDCap forms, and QA flags.
            </div>
          </div>
          <button style={{
            background: 'rgba(255,204,0,0.1)', color: '#ffcc00',
            border: '1px solid rgba(255,204,0,0.25)', padding: '5px 10px',
            borderRadius: 999, fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
            cursor: 'pointer',
          }}>open log →</button>
        </div>

        <div style={{
          background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '16px 18px', minHeight: 180,
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          <Typewriter items={window.ESD_INSIGHTS} syncTick={syncTick} />
        </div>
      </div>
    </div>
  );
}

// ===== Recent participant flow =====
function ParticipantFlow() {
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #ececea',
      borderRadius: 24, padding: 0,
      boxShadow: '0 8px 30px rgba(0,0,0,0.04)', overflow: 'hidden',
      minHeight: 320,
    }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1efeb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: '"Source Serif 4", serif', fontSize: 22, fontWeight: 600, color: '#1c1a18', letterSpacing: '-0.01em' }}>Recent participant flow</div>
          <div style={{ fontSize: 12, color: '#6f6b66', marginTop: 4 }}>Last 4 hours of visit activity across all sites</div>
        </div>
        <button style={{
          background: 'transparent', color: '#73000a',
          border: '1px solid #ededeb', padding: '5px 12px',
          borderRadius: 999, fontSize: 11, fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
        }}>view all →</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {window.ESD_PARTICIPANTS.map((p, i) => (
          <div key={p.id} style={{
            display: 'grid', gridTemplateColumns: '110px 56px 1fr auto auto', gap: 14,
            padding: '12px 24px', borderBottom: i < window.ESD_PARTICIPANTS.length - 1 ? '1px solid #f6f4ef' : 'none',
            alignItems: 'center', transition: 'background 100ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#1c1a18', fontWeight: 500 }}>{p.id}</span>
            <GroupTag group={p.group} />
            <div>
              <span style={{ fontSize: 12, color: '#3d3a36' }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', color: '#6f6b66' }}>{p.visit}</span>
                <span style={{ color: '#c9c7c2', margin: '0 8px' }}>·</span>
                <Gloss term="CGA">CGA</Gloss> <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{p.cga}</span>
                <span style={{ color: '#c9c7c2', margin: '0 8px' }}>·</span>
                <span style={{ color: '#9c9893' }}>{p.site}</span>
              </span>
            </div>
            <StatusPill status={p.status} />
            <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#9c9893', minWidth: 70, textAlign: 'right' }}>{p.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== App =====
function App() {
  const [active, setActive] = useStateA('overview');
  const [query, setQuery] = useStateA('');
  const [syncTick, setSyncTick] = useStateA(0);
  const [syncing, setSyncing] = useStateA(false);
  const [selectedStage, setSelectedStage] = useStateA('qa');
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULS);

  function forceSync() {
    setSyncing(true);
    setSyncTick(t => t + 1);
    setTimeout(() => setSyncing(false), 1800);
  }

  // refresh icons after every render that adds nodes
  useEffectA(() => { if (window.lucide) window.lucide.createIcons(); });

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      minWidth: 1280,
      background: '#fafaf8',
      fontFamily: 'Inter, sans-serif', color: '#1c1a18',
    }}>
      <Sidebar active={active} setActive={setActive} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header onSync={forceSync} syncing={syncing} query={query} setQuery={setQuery} />
        <HipaaBanner />

        <main style={{
          flex: 1,
          padding: tweaks.density === 'tight' ? '24px 32px' : '36px 40px',
          maxWidth: 1480,
        }}>
          {/* Page heading */}
          <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#9c9893', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Lab Pulse · {new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <h2 style={{ margin: '6px 0 0', fontFamily: '"Source Serif 4", serif', fontSize: 38, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.05, color: '#1c1a18' }}>
                Live <span style={{ fontStyle: 'italic', color: '#73000a' }}>NANO</span> Pipeline &amp; Lab Operations
              </h2>
              <div style={{ marginTop: 8, fontSize: 14, color: '#6f6b66', maxWidth: 560 }}>
                From <Gloss term="Actiheart">Actiheart-5</Gloss> ingest to de-identified export — six stages, one heartbeat. Click any node for stage detail.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ededeb', background: '#fff', fontSize: 12, fontFamily: 'Inter, sans-serif', cursor: 'pointer', color: '#3d3a36' }}>Last 24 h</button>
              <button style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ededeb', background: '#fff', fontSize: 12, fontFamily: 'Inter, sans-serif', cursor: 'pointer', color: '#3d3a36' }}>Export figure</button>
            </div>
          </div>

          {/* KPI ribbon */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {window.ESD_KPIS.map(k => <KPICard key={k.id} kpi={k} syncTick={syncTick} />)}
          </div>

          {/* DAG */}
          <div style={{ marginBottom: 24 }}>
            <PipelineDAG syncTick={syncTick} syncing={syncing} onSelect={setSelectedStage} selected={selectedStage} />
          </div>

          {/* Bottom split */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 16 }}>
            <QAInsightsPanel syncTick={syncTick} />
            <ParticipantFlow />
          </div>

          <div style={{ marginTop: 36, paddingTop: 16, borderTop: '1px solid #ececea', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9c9893', fontFamily: '"JetBrains Mono", monospace' }}>
            <span>Early Social Development Lab · Dr. Jessica Bradshaw · UofSC</span>
            <span>NIH R01 MH123456 · IRB Pro00115234 · v0.15.0</span>
          </div>
        </main>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="DAG visualization">
          <TweakRadio
            label="Pulse style"
            value={tweaks.dagDots}
            options={[{ value: 'flowing', label: 'Flowing' }, { value: 'rings', label: 'Rings' }]}
            onChange={v => setTweak('dagDots', v)}
          />
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio
            label="Density"
            value={tweaks.density}
            options={[{ value: 'cozy', label: 'Cozy' }, { value: 'tight', label: 'Tight' }]}
            onChange={v => setTweak('density', v)}
          />
        </TweakSection>
        <TweakSection title="Data refresh">
          <TweakButton onClick={forceSync}>Trigger force sync</TweakButton>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
