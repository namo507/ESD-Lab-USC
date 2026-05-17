// ESD Lab dashboard — primitives.
// Badge, Button, Card, Icon, KPI, Tooltip (incl. gloss explainer), Sparkline, MiniBar.
const { useState: useStateP, useEffect: useEffectP, useRef: useRefP } = React;

const C = {
  garnet: '#73000a', garnet600: '#8b1b25', garnet800: '#560008',
  gold: '#ffcc00', goldTint: '#fff4bf',
  ink: '#0e1013', s900: '#1b1e22', s800: '#2a2e33', s700: '#3a3d42',
  s600: '#54585f', s500: '#6b7076', s400: '#9a9ea4', s300: '#c9c7c2',
  s200: '#e6e5e2', s100: '#eeece8', s75: '#f3f1ed', s50: '#f7f7f8',
  paper: '#fafaf9', white: '#ffffff',
  blue: '#4C72B0', green: '#55A868', red: '#C44E52', purple: '#8172B2',
  blueT: '#e4ebf4', greenT: '#e5efe8', redT: '#f5e1e2', purpleT: '#ece7f2',
};

function Icon({ name, size = 16, color = C.s700, stroke = 1.5, style }) {
  return <i data-lucide={name} style={{ width: size, height: size, color, strokeWidth: stroke, display: 'inline-flex', flexShrink: 0, ...style }} />;
}

function refreshIcons() {
  useEffectP(() => { if (window.lucide) window.lucide.createIcons(); });
}

function Badge({ kind = 'neutral', children, mono = false, size = 'md', style }) {
  const map = {
    info:    { bg: C.blueT,   fg: '#2f4a7a', dot: C.blue },
    ok:      { bg: C.greenT,  fg: '#2a5f37', dot: C.green },
    fail:    { bg: C.redT,    fg: '#7a2f33', dot: C.red },
    pending: { bg: C.purpleT, fg: '#4b3b75', dot: C.purple },
    neutral: { bg: C.s100,    fg: C.s700,    dot: null },
    phi:     { bg: C.garnet,  fg: '#fff',    dot: null },
    asib:    { bg: '#3b2966', fg: '#fff',    dot: null },
    pt:      { bg: C.gold,    fg: '#3a2a00', dot: null },
    td:      { bg: C.s500,    fg: '#fff',    dot: null },
    vpt:     { bg: C.garnet,  fg: '#fff',    dot: null },
    warn:    { bg: '#fff4bf', fg: '#5c4500', dot: null },
    gold:    { bg: C.gold,    fg: '#3a2a00', dot: null },
    inverse: { bg: C.ink,     fg: '#fff',    dot: null },
  };
  const s = map[kind] || map.neutral;
  const sz = size === 'sm' ? { fs: 10, px: 6, py: 2 } : { fs: 11, px: 8, py: 3 };
  return (
    <span style={{
      background: s.bg, color: s.fg,
      fontSize: sz.fs, fontWeight: 600,
      padding: `${sz.py}px ${sz.px}px`, borderRadius: 4,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      letterSpacing: '.02em', lineHeight: 1.3,
      fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
      whiteSpace: 'nowrap', ...style,
    }}>
      {s.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />}
      {children}
    </span>
  );
}

function Button({ variant = 'primary', size = 'md', children, onClick, icon, iconRight, disabled, style, ...rest }) {
  const variants = {
    primary:   { bg: C.garnet, fg: '#fff',     bd: C.garnet, hover: C.garnet600 },
    secondary: { bg: C.white,  fg: C.ink,      bd: C.s300,   hover: C.s50 },
    ghost:     { bg: 'transparent', fg: C.ink, bd: 'transparent', hover: C.s75 },
    danger:    { bg: C.white,  fg: C.red,      bd: '#e0b7b9', hover: C.redT },
    gold:      { bg: C.gold,   fg: '#3a2a00',  bd: C.gold,   hover: '#ffd633' },
  };
  const sizes = { sm: '5px 10px', md: '7px 13px', lg: '10px 18px' };
  const fs = size === 'sm' ? 12 : size === 'lg' ? 14 : 13;
  const v = variants[variant];
  const [h, setH] = useStateP(false);
  return (
    <button onClick={onClick} disabled={disabled} {...rest}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h && !disabled ? v.hover : v.bg, color: v.fg,
        border: `1px solid ${v.bd}`,
        padding: sizes[size], borderRadius: 2, fontSize: fs,
        fontWeight: 600, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 7, lineHeight: 1,
        transition: 'all 120ms cubic-bezier(0.4,0,0.2,1)', ...style,
      }}>
      {icon && <Icon name={icon} size={fs + 1} color={v.fg} />}
      {children}
      {iconRight && <Icon name={iconRight} size={fs + 1} color={v.fg} />}
    </button>
  );
}

function Card({ children, style, pad = 24, hoverable = false, onClick }) {
  const [h, setH] = useStateP(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => hoverable && setH(true)}
      onMouseLeave={() => hoverable && setH(false)}
      style={{
        background: '#fff',
        border: `1px solid ${h ? C.s300 : C.s200}`,
        borderRadius: 2, padding: pad,
        transition: 'border-color 120ms ease',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}>{children}</div>
  );
}

function SectionLabel({ children, style }) {
  return <div style={{
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '.08em', color: C.s500, ...style,
  }}>{children}</div>;
}

// ===== Tooltip =====
// Two modes:
//   <Tooltip text="..."><span>UI</span></Tooltip>           — simple
//   <Gloss term="RMSSD" />                                   — inline acronym w/ underline + popover
function Tooltip({ text, children, gloss, side = 'top', maxWidth = 280, style }) {
  const [open, setOpen] = useStateP(false);
  const ref = useRefP(null);
  const body = gloss && window.GLOSS && window.GLOSS[gloss] ? window.GLOSS[gloss] : text;
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} tabIndex={-1}>
      {children}
      {open && body && (
        <span role="tooltip" style={{
          position: 'absolute',
          [side === 'top' ? 'bottom' : 'top']: 'calc(100% + 6px)',
          left: '50%', transform: 'translateX(-50%)',
          background: C.ink, color: '#fff',
          fontSize: 12, lineHeight: 1.45, fontWeight: 400,
          padding: '8px 11px', borderRadius: 2,
          width: 'max-content', maxWidth,
          textAlign: 'left', letterSpacing: 0,
          fontFamily: "'Source Sans 3', sans-serif",
          boxShadow: '0 1px 2px rgba(14,16,19,0.04), 0 4px 16px rgba(14,16,19,0.18)',
          zIndex: 50, pointerEvents: 'none', whiteSpace: 'normal',
        }}>{body}</span>
      )}
    </span>
  );
}

// Inline glossary chip — underlined acronym, hover shows definition
function Gloss({ term, children, dotted = true }) {
  return (
    <Tooltip gloss={term} maxWidth={320}>
      <span style={{
        borderBottom: dotted ? `1px dotted ${C.s400}` : 'none',
        cursor: 'help',
      }}>{children || term}</span>
    </Tooltip>
  );
}

// ===== Sparkline =====
function Sparkline({ values, w = 120, h = 28, color = C.s700, fill = false, dotLast = false }) {
  if (!values || values.length === 0) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => [i * stepX, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const fillD = fill ? d + ` L ${w} ${h} L 0 ${h} Z` : null;
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {fillD && <path d={fillD} fill={color} opacity={0.08} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      {dotLast && <circle cx={last[0]} cy={last[1]} r={2} fill={color} />}
    </svg>
  );
}

// Numeric KPI
function KPI({ label, value, unit, sub, delta, deltaKind = 'flat', spark, spline, gloss, style }) {
  const dColor = deltaKind === 'up' ? C.green : deltaKind === 'down' ? C.red : C.s500;
  return (
    <Card pad={18} style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>
          {gloss ? <Gloss term={gloss}>{label}</Gloss> : label}
        </SectionLabel>
        {spark && <Sparkline values={spark} w={64} h={18} color={C.s400} dotLast />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 30, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.015em' }}>{value}</div>
        {unit && <div style={{ fontSize: 12, color: C.s500, fontFamily: "'JetBrains Mono', monospace" }}>{unit}</div>}
        {delta && (
          <div style={{ marginLeft: 'auto', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: dColor }}>{delta}</div>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.s500, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

// Tiny segmented control
function Segmented({ options, value, onChange, size = 'md' }) {
  const fs = size === 'sm' ? 11 : 12;
  const py = size === 'sm' ? 4 : 6;
  return (
    <div style={{
      display: 'inline-flex', border: `1px solid ${C.s300}`, borderRadius: 2,
      background: '#fff', overflow: 'hidden',
    }}>
      {options.map(o => {
        const active = (typeof o === 'object' ? o.value : o) === value;
        const lbl = typeof o === 'object' ? o.label : o;
        const v = typeof o === 'object' ? o.value : o;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            font: 'inherit', fontSize: fs, fontWeight: 500,
            padding: `${py}px 10px`,
            background: active ? C.ink : 'transparent',
            color: active ? '#fff' : C.s700,
            border: 'none', borderRight: `1px solid ${C.s200}`,
            cursor: 'pointer', letterSpacing: '.01em',
          }}>{lbl}</button>
        );
      })}
    </div>
  );
}

// ECG-like signal generator for QA tiles & participant header
function ecgPath(width = 120, height = 32, seed = 1, flag = 'clean') {
  const pts = [];
  const beats = flag === 'flatline' ? 0 : flag === 'noise' ? 24 : 4 + (seed % 3);
  const beatW = beats > 0 ? width / beats : width;
  for (let x = 0; x <= width; x += 1) {
    let y = height / 2;
    if (flag === 'flatline') {
      y += (Math.sin(x * 0.5 + seed) * 0.4);
    } else if (flag === 'noise') {
      y += (Math.sin(x * 0.7 + seed) + Math.sin(x * 1.3 + seed * 2)) * 6 + (((x * 9301 + seed * 49297) % 233280) / 233280 - 0.5) * 8;
    } else if (flag === 'motion') {
      const phase = (x % beatW) / beatW;
      y -= Math.sin(phase * Math.PI * 2) * 4;
      y += Math.sin(x * 0.2 + seed) * 5;
    } else {
      // clean / ectopic — proper R-peak shape
      const phase = (x % beatW) / beatW;
      let bump = 0;
      if (phase > 0.42 && phase < 0.5) bump = -((phase - 0.42) / 0.08) * 4;
      else if (phase >= 0.5 && phase < 0.55) bump = ((phase - 0.5) / 0.05) * (height * 0.45) - 4;
      else if (phase >= 0.55 && phase < 0.62) bump = ((0.62 - phase) / 0.07) * (height * 0.45);
      else if (phase >= 0.7 && phase < 0.82) bump = -Math.sin((phase - 0.7) / 0.12 * Math.PI) * 3;
      y -= bump;
      // ectopic — alter every 3rd beat
      if (flag === 'ectopic' && Math.floor(x / beatW) % 3 === 1 && phase > 0.45 && phase < 0.6) {
        y -= 4;
      }
    }
    pts.push([x, Math.max(2, Math.min(height - 2, y))]);
  }
  return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1].toFixed(1)).join(' ');
}

Object.assign(window, {
  C, Icon, refreshIcons, Badge, Button, Card, SectionLabel,
  Tooltip, Gloss, Sparkline, KPI, Segmented, ecgPath,
});
