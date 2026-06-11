// Animated DAG for the warm ESD Lab Dashboard.
// 6 stages, curved edges, glowing dots that travel along the paths,
// active nodes get a soft pulsing outer ring in pale blue.
const { useState: useStateD, useEffect: useEffectD, useRef: useRefD } = React;

function PipelineDAG({ syncTick, syncing, onSelect, selected }) {
  const stages = window.ESD_STAGES;
  const W = 1100, H = 280;
  const padX = 70;
  const colW = (W - padX * 2) / (stages.length - 1);
  const cy = 150;

  const nodes = stages.map((s, i) => ({ ...s, x: padX + i * colW, y: cy }));

  function curve(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }

  const accentBg = {
    sand: '#fbf6ec', ocean: '#eaf0f8', sage: '#eaf0eb', mint: '#e7f1ea',
  };
  const accentRing = {
    sand: '#d4b676', ocean: '#9bb8e0', sage: '#85a892', mint: '#7dc59a',
  };

  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(180deg, #ffffff 0%, #fafaf8 100%)',
      border: '1px solid #ececea',
      borderRadius: 24,
      padding: '24px 24px 12px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      {/* faint grid backdrop */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(28,26,24,0.04) 1px, transparent 0)',
        backgroundSize: '20px 20px',
      }} />

      {/* legend strip */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#73000a',
              boxShadow: '0 0 0 4px rgba(115,0,10,0.18)',
              animation: 'esd-breathe 1.6s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#3d3a36', letterSpacing: '0.02em' }}>
              {syncing ? 'force-sync · pulses accelerated' : '78 epochs in flight'}
            </span>
          </div>
          <span style={{ width: 1, height: 12, background: '#dad7d2' }} />
          <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#6f6b66' }}>
            6 stages · live
          </span>
        </div>
        <div style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#9c9893' }}>
          tip · click any stage for detail
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'relative', width: '100%', display: 'block' }}>
        <defs>
          {/* glow filter */}
          <filter id="esd-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="dot-glow">
            <stop offset="0%" stopColor="#73000a" stopOpacity="1" />
            <stop offset="60%" stopColor="#73000a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#73000a" stopOpacity="0" />
          </radialGradient>
          {/* per-edge paths, kept invisible, used by animateMotion */}
          {nodes.slice(0, -1).map((n, i) => {
            const next = nodes[i + 1];
            return (
              <path key={'pdef' + i} id={'esd-edge-' + i}
                d={curve(n.x + 38, n.y, next.x - 38, next.y)} />
            );
          })}
        </defs>

        {/* visible edges */}
        {nodes.slice(0, -1).map((n, i) => {
          const next = nodes[i + 1];
          const flowing = n.inflight > 0 || next.inflight > 0;
          return (
            <g key={'edge' + i}>
              {/* base track */}
              <path d={curve(n.x + 38, n.y, next.x - 38, next.y)}
                fill="none" stroke="#e6e4e0" strokeWidth={5} strokeLinecap="round" />
              {/* gradient track when flowing */}
              {flowing && (
                <path d={curve(n.x + 38, n.y, next.x - 38, next.y)}
                  fill="none" stroke="rgba(115,0,10,0.25)" strokeWidth={1.5}
                  strokeDasharray="3 5" strokeLinecap="round" />
              )}
              {/* throughput count */}
              <text x={(n.x + next.x) / 2} y={n.y - 18} textAnchor="middle"
                style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', fill: flowing ? '#73000a' : '#9c9893', fontWeight: 600 }}>
                {n.inflight} ↦
              </text>
            </g>
          );
        })}

        {/* traveling dots (3 per edge, staggered) */}
        {nodes.slice(0, -1).map((n, i) => {
          const next = nodes[i + 1];
          const flowing = n.inflight > 0 || next.inflight > 0;
          if (!flowing) return null;
          const dur = syncing ? 0.7 : 1.6;
          return (
            <g key={'dots' + i}>
              {[0, 0.33, 0.66].map((delay, j) => (
                <g key={j}>
                  <circle r={6} fill="url(#dot-glow)" opacity={0.55}>
                    <animateMotion dur={dur + 's'} repeatCount="indefinite" begin={(delay * dur) + 's'}>
                      <mpath href={'#esd-edge-' + i} />
                    </animateMotion>
                  </circle>
                  <circle r={2.5} fill="#73000a" filter="url(#esd-glow)">
                    <animateMotion dur={dur + 's'} repeatCount="indefinite" begin={(delay * dur) + 's'}>
                      <mpath href={'#esd-edge-' + i} />
                    </animateMotion>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const isActive = n.inflight > 0;
          const isSel = selected === n.id;
          return (
            <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: 'pointer' }}>
              {/* outer pulse ring */}
              {isActive && (
                <circle cx={n.x} cy={n.y} r={42} fill="none" stroke={accentRing[n.color]} strokeWidth={1.5} opacity={0.5}>
                  <animate attributeName="r" values="36;48;36" dur={syncing ? '1s' : '2.4s'} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0;0.5" dur={syncing ? '1s' : '2.4s'} repeatCount="indefinite" />
                </circle>
              )}
              {/* node fill */}
              <circle cx={n.x} cy={n.y} r={36}
                fill={accentBg[n.color]}
                stroke={isSel ? '#73000a' : accentRing[n.color]}
                strokeWidth={isSel ? 2 : 1.2} />
              {/* inflight number */}
              <text x={n.x} y={n.y + 2} textAnchor="middle"
                style={{ fontFamily: '"Source Serif 4", serif', fontSize: 24, fontWeight: 600, fill: '#1c1a18', fontVariantNumeric: 'tabular-nums' }}>
                {n.inflight}
              </text>
              <text x={n.x} y={n.y + 16} textAnchor="middle"
                style={{ fontSize: 9, fontFamily: '"JetBrains Mono", monospace', fill: '#6f6b66', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                in flight
              </text>
              {/* label below */}
              <text x={n.x} y={n.y + 60} textAnchor="middle"
                style={{ fontSize: 13, fontWeight: 600, fill: '#1c1a18', fontFamily: 'Inter, sans-serif' }}>
                {n.label}
              </text>
              <text x={n.x} y={n.y + 76} textAnchor="middle"
                style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', fill: '#9c9893' }}>
                {n.short}
              </text>
              {/* done count above */}
              <text x={n.x} y={n.y - 50} textAnchor="middle"
                style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', fill: '#9c9893' }}>
                {n.done.toLocaleString()} done
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

Object.assign(window, { PipelineDAG });
