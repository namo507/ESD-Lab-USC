// Shell: TopNav + Sidebar + HIPAA banner + routing.
const { useState: useStateShell } = React;

function TopNav({ user = 'JB', onSearch, query, route, setRoute, runStatus }) {
  refreshIcons();
  const items = [
    { id: 'overview', label: 'Pipeline' },
    { id: 'participants', label: 'Participants' },
    { id: 'qa', label: 'QA review' },
    { id: 'results', label: 'Results' },
    { id: 'runs', label: 'Runs' },
    { id: 'redcap', label: 'REDCap' },
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 56,
      padding: '0 24px', borderBottom: `1px solid ${C.s200}`,
      background: '#fff', gap: 24, position: 'sticky', top: 0, zIndex: 40,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 22, height: 22, background: C.garnet, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 5, top: 6, width: 12, height: 2, background: C.gold }} />
          <div style={{ position: 'absolute', left: 5, top: 11, width: 12, height: 2, background: '#fff' }} />
          <div style={{ position: 'absolute', left: 5, top: 16, width: 7, height: 2, background: '#fff' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, fontWeight: 600 }}>ESD Lab</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.s400, letterSpacing: '.12em', marginTop: 2 }}>NANO STUDY · USC</div>
        </div>
      </div>
      <ul style={{ display: 'flex', listStyle: 'none', padding: 0, margin: 0, gap: 4, alignSelf: 'stretch' }}>
        {items.map(i => (
          <li key={i.id} onClick={() => setRoute({ name: i.id })} style={{
            fontSize: 13, color: route.name === i.id ? C.ink : C.s700,
            fontWeight: route.name === i.id ? 600 : 500,
            display: 'flex', alignItems: 'center',
            padding: '0 12px',
            borderBottom: `2px solid ${route.name === i.id ? C.garnet : 'transparent'}`,
            cursor: 'pointer',
          }}>{i.label}</li>
        ))}
      </ul>
      <div style={{ flex: 1 }} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: C.s50, border: `1px solid ${C.s200}`, borderRadius: 2,
        padding: '5px 10px', minWidth: 240,
      }}>
        <Icon name="search" size={13} color={C.s500} />
        <input
          value={query} onChange={e => onSearch(e.target.value)}
          placeholder="NANO-XXXX, group, visit, run id"
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            font: 'inherit', fontSize: 12, color: C.ink, flex: 1,
            fontFamily: "'JetBrains Mono', monospace",
          }}/>
        <kbd style={{
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          color: C.s500, background: '#fff', border: `1px solid ${C.s200}`,
          padding: '1px 5px', borderRadius: 2,
        }}>⌘K</kbd>
      </div>

      <Tooltip text="Live pipeline status. Click Runs to see detail.">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: C.s700,
          fontFamily: "'JetBrains Mono', monospace",
          padding: '4px 10px',
          border: `1px solid ${C.s200}`, borderRadius: 2,
          cursor: 'help',
        }} onClick={() => setRoute({ name: 'runs' })}>
          <span className="pulse-dot" style={{
            width: 7, height: 7, borderRadius: '50%',
            background: runStatus === 'running' ? C.blue : C.green,
          }} />
          <span>{runStatus === 'running' ? 'run_2026_115_a · hrv' : 'idle'}</span>
        </div>
      </Tooltip>

      <Tooltip text="HIPAA-protected session. Auto-locks after 30 min of inactivity.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.s500, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", cursor: 'help' }}>
          <Icon name="shield-check" color={C.green} size={13} />
          <span>28 m</span>
        </div>
      </Tooltip>

      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: C.s100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: C.s700,
        border: `1px solid ${C.s200}`,
      }}>{user}</div>
    </div>
  );
}

function HipaaBanner({ onDismiss }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 24px', background: '#faf2f2',
      borderBottom: `1px solid ${C.s200}`,
      fontSize: 12, color: C.s700,
    }}>
      <Icon name="alert-triangle" color={C.garnet} size={13} />
      <span>
        <strong style={{ color: C.garnet }}>HIPAA notice ·</strong> this dashboard exposes PHI from the NANO study.
        Do not share credentials or screenshots. All access is logged to <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s700 }}>audit/hipaa_access.log</code>.
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ color: C.s500, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>IRB Pro00115234 · NIH R01 MH123456</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
        <Icon name="x" size={13} color={C.s500} />
      </button>
    </div>
  );
}

function Sidebar({ route, setRoute, study }) {
  refreshIcons();
  const groups = [
    {
      label: 'Pipeline', items: [
        { id: 'overview', icon: 'git-branch',  label: 'Overview' },
        { id: 'qa',       icon: 'shield-check', label: 'Window QA', badge: '27' },
        { id: 'runs',     icon: 'play-circle', label: 'Runs', badge: '1' },
      ]
    },
    {
      label: 'Study', items: [
        { id: 'participants', icon: 'users', label: 'Participants' },
        { id: 'results',      icon: 'line-chart', label: 'Results' },
        { id: 'redcap',       icon: 'database', label: 'REDCap sync' },
      ]
    },
  ];
  return (
    <div style={{
      width: 240, borderRight: `1px solid ${C.s200}`, background: C.paper,
      padding: '20px 0 24px', alignSelf: 'stretch', flexShrink: 0,
      position: 'sticky', top: 56, alignSelf: 'flex-start', height: 'calc(100vh - 56px)',
      display: 'flex', flexDirection: 'column', gap: 8,
      overflowY: 'auto',
    }}>
      {groups.map(g => (
        <div key={g.label} style={{ padding: '0 12px 4px' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.1em', color: C.s400, padding: '0 10px 8px',
          }}>{g.label}</div>
          {g.items.map(it => {
            const active = route.name === it.id;
            return (
              <div key={it.id} onClick={() => setRoute({ name: it.id })}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.s75; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                  fontSize: 13, color: active ? C.ink : C.s700,
                  fontWeight: active ? 600 : 500,
                  background: active ? C.s100 : 'transparent',
                  borderLeft: `2px solid ${active ? C.garnet : 'transparent'}`,
                  paddingLeft: 8,
                  borderRadius: 0, cursor: 'pointer', marginBottom: 1,
                  transition: 'background 120ms ease',
                }}>
                <Icon name={it.icon} color={active ? C.garnet : C.s600} size={15} />
                <span>{it.label}</span>
                {it.badge && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                    color: active ? C.garnet : C.s500,
                    background: active ? C.gold : C.s100,
                    padding: '1px 6px', borderRadius: 2,
                  }}>{it.badge}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ flex: 1 }} />

      {/* Study summary */}
      <div style={{ padding: '0 16px', marginTop: 16 }}>
        <div style={{
          padding: 12, background: '#fff', border: `1px solid ${C.s200}`,
          borderRadius: 2,
        }}>
          <SectionLabel style={{ marginBottom: 6 }}>NANO · year 3 of 5</SectionLabel>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 22, fontWeight: 600, lineHeight: 1, marginTop: 4 }}>
            {study.enrolled}<span style={{ color: C.s400, fontSize: 14 }}> / {study.target}</span>
          </div>
          <div style={{ fontSize: 11, color: C.s500, marginTop: 4 }}>infants enrolled · {study.target - study.enrolled} to target</div>
          <div style={{ display: 'flex', height: 4, background: C.s100, marginTop: 8, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(study.enrolled / study.target) * 100}%`, background: C.garnet }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 24px', fontSize: 10, color: C.s400, fontFamily: "'JetBrains Mono', monospace", textAlign: 'left', lineHeight: 1.6 }}>
        v0.14.2 · main · 8a3f1c
      </div>
    </div>
  );
}

Object.assign(window, { TopNav, HipaaBanner, Sidebar });
