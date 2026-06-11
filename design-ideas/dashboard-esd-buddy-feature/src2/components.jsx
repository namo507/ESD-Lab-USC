// Components for the warm ESD Lab Dashboard.
const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

// ===== Tooltip + Gloss =====
function Tooltip({ children, text, gloss, term, maxWidth = 280 }) {
  const [open, setOpen] = useStateC(false);
  const wrapRef = useRefC(null);
  const body = gloss || (term && window.ESD_GLOSS[term]) || text;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      {open && body && (
        <span role="tooltip" style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)', zIndex: 60,
          background: 'rgba(28, 26, 24, 0.96)', color: '#fafaf9',
          padding: '10px 12px', borderRadius: 8,
          fontSize: 12, lineHeight: 1.5, fontWeight: 400,
          maxWidth, width: 'max-content',
          boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
          fontFamily: 'Inter, sans-serif',
          backdropFilter: 'blur(6px)',
          pointerEvents: 'none',
        }}>
          {term && <span style={{ display: 'block', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#ffcc00', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{term}</span>}
          {body}
          <span style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)', width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid rgba(28,26,24,0.96)',
          }} />
        </span>
      )}
    </span>
  );
}

function Gloss({ term, children }) {
  return (
    <Tooltip term={term}>
      <span style={{
        borderBottom: '1px dashed rgba(115,0,10,0.35)',
        cursor: 'help', paddingBottom: 1,
      }}>{children || term}</span>
    </Tooltip>
  );
}

// ===== Animated number counter =====
function Counter({ to, decimals = 0, duration = 1200, trigger = 0, formatter }) {
  const [val, setVal] = useStateC(to);
  const startRef = useRefC(null);
  const fromRef = useRefC(0);

  useEffectC(() => {
    if (trigger === 0) return; // don't animate on first mount
    fromRef.current = 0;
    startRef.current = null;
    let raf;
    function step(ts) {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(fromRef.current + (to - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setVal(to);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [trigger, to, duration]);

  const display = formatter ? formatter(val) : val.toLocaleString(undefined, {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{display}</span>;
}

// ===== Sparkline =====
function Sparkline({ values, w = 120, h = 30, color = '#73000a', accent = 'sage' }) {
  if (!values || !values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 4 - ((v - min) / range) * (h - 8);
    return [x, y];
  });
  const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const fillColors = { sage: '#cdd9cf', ocean: '#cdd9ec', sand: '#ede4cf', mint: '#c8e0d4' };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, display: 'block' }}>
      <path d={area} fill={fillColors[accent] || fillColors.sage} opacity={0.5} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}

// ===== KPI Card =====
function KPICard({ kpi, syncTick }) {
  const accentBg = {
    sage:  'linear-gradient(135deg, rgba(227,232,228,0.85) 0%, rgba(227,232,228,0.25) 60%, rgba(255,255,255,0) 100%)',
    ocean: 'linear-gradient(135deg, rgba(224,232,245,0.85) 0%, rgba(224,232,245,0.25) 60%, rgba(255,255,255,0) 100%)',
    sand:  'linear-gradient(135deg, rgba(249,246,240,1) 0%, rgba(249,246,240,0.4) 60%, rgba(255,255,255,0) 100%)',
    mint:  'linear-gradient(135deg, rgba(218,236,225,0.85) 0%, rgba(218,236,225,0.25) 60%, rgba(255,255,255,0) 100%)',
  };
  const accentDot = { sage: '#5b9577', ocean: '#6b8bb8', sand: '#c79026', mint: '#5b9577' };

  const formatter = kpi.id === 'redcap'
    ? v => v.toFixed(1)
    : kpi.id === 'epochs'
      ? v => Math.round(v).toLocaleString()
      : v => Math.round(v).toString();

  return (
    <div style={{
      position: 'relative',
      background: '#ffffff',
      border: '1px solid #ececea',
      borderRadius: 18,
      padding: 22,
      boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
      overflow: 'hidden',
      minHeight: 152,
    }}>
      {/* accent wash */}
      <div style={{ position: 'absolute', inset: 0, background: accentBg[kpi.accent], pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentDot[kpi.accent] }} />
              <span style={{ fontSize: 11, color: '#6f6b66', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>
                {kpi.label}
              </span>
            </div>
          </div>
          {kpi.badge && (
            <span style={{
              fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
              background: '#73000a', color: '#fff',
              padding: '3px 7px', borderRadius: 999, letterSpacing: '0.04em',
            }}>{kpi.badge}</span>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: '"Source Serif 4", serif', fontSize: 38, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1, color: '#1c1a18' }}>
            <Counter to={kpi.value} decimals={kpi.id === 'redcap' ? 1 : 0} trigger={syncTick} formatter={formatter} />
          </span>
          {kpi.unit && <span style={{ fontSize: 13, fontFamily: '"JetBrains Mono", monospace', color: '#6f6b66' }}>{kpi.unit}</span>}
        </div>

        <div style={{ fontSize: 12, color: '#6f6b66', marginTop: 6, lineHeight: 1.4 }}>{kpi.sub}</div>

        <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#5b9577', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span>↗</span> {kpi.delta}
          </span>
          {kpi.spark && <Sparkline values={kpi.spark} w={108} h={28} color="#73000a" accent={kpi.accent} />}
        </div>
      </div>
    </div>
  );
}

// ===== Status pill =====
function StatusPill({ status }) {
  const m = window.statusMap[status] || { label: status, dot: '#999' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', background: '#f6f4ef', borderRadius: 999,
      fontSize: 11, color: '#3d3a36', border: '1px solid #ededeb',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot }} />
      {m.label}
    </span>
  );
}

// ===== Group tag =====
function GroupTag({ group }) {
  const map = {
    VPT:  { bg: '#fae8ea', fg: '#73000a' },
    ASIB: { bg: '#ece4f0', fg: '#5e3776' },
    TD:   { bg: '#e8efe9', fg: '#3d6650' },
  };
  const m = map[group] || map.TD;
  return (
    <Tooltip term={group}>
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
        fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
        fontWeight: 600, letterSpacing: '0.05em',
        background: m.bg, color: m.fg, cursor: 'help',
      }}>{group}</span>
    </Tooltip>
  );
}

// ===== Typewriter =====
function Typewriter({ items, speed = 18, syncTick }) {
  const [shown, setShown] = useStateC(0);
  const [chars, setChars] = useStateC(0);

  useEffectC(() => {
    if (shown >= items.length) {
      // restart cycle after pause
      const t = setTimeout(() => { setShown(0); setChars(0); }, 4500);
      return () => clearTimeout(t);
    }
    const txt = items[shown].text;
    if (chars < txt.length) {
      const t = setTimeout(() => setChars(c => c + 1), speed);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => { setShown(s => s + 1); setChars(0); }, 1400);
      return () => clearTimeout(t);
    }
  }, [shown, chars, items, speed]);

  // reset on sync
  useEffectC(() => {
    if (syncTick > 0) { setShown(0); setChars(0); }
  }, [syncTick]);

  const kindMap = {
    alert: { c: '#ff8a7c', glyph: '!' },
    warn:  { c: '#ffcc00', glyph: '~' },
    info:  { c: '#9bb8e0', glyph: '·' },
    ok:    { c: '#7dc59a', glyph: '✓' },
  };

  return (
    <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12.5, lineHeight: 1.7, color: '#cfcdc9' }}>
      {items.slice(0, shown).map((it, i) => {
        const k = kindMap[it.kind];
        return (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, opacity: 0.7 }}>
            <span style={{ color: k.c, flexShrink: 0 }}>&gt;</span>
            <span><span style={{ color: k.c, marginRight: 6 }}>[{it.kind}]</span>{it.text}</span>
          </div>
        );
      })}
      {shown < items.length && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <span style={{ color: kindMap[items[shown].kind].c, flexShrink: 0 }}>&gt;</span>
          <span>
            <span style={{ color: kindMap[items[shown].kind].c, marginRight: 6 }}>[{items[shown].kind}]</span>
            {items[shown].text.slice(0, chars)}
            <span style={{ display: 'inline-block', width: 8, height: 14, background: '#ffcc00', verticalAlign: 'text-bottom', marginLeft: 1, animation: 'esd-blink 1s steps(2) infinite' }} />
          </span>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Tooltip, Gloss, Counter, Sparkline, KPICard, StatusPill, GroupTag, Typewriter });
