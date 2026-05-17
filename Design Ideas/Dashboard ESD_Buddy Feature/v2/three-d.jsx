// 3D — tilt hook, hero heart, layered slab architecture stack.
// All effects are wrapped in @media (hover: hover) gates so touch devices
// degrade gracefully, and prefers-reduced-motion disables continuous motion.
const { useState: useS6, useEffect: useE6, useRef: useR6, useMemo: useM6 } = React;

// ============================================================
// useTilt — mouse-driven 3D rotation on any element ref.
// ============================================================
function useTilt(opts = {}) {
  const ref = useR6(null);
  useE6(() => {
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = ref.current; if (!el) return;
    const max = opts.max ?? 8;
    const scale = opts.scale ?? 1.01;
    let rx = 0, ry = 0, tx = 0, ty = 0, raf;
    function tick() {
      tx += (rx - tx) * 0.18;
      ty += (ry - ty) * 0.18;
      el.style.transform = `perspective(1200px) rotateX(${ty.toFixed(2)}deg) rotateY(${tx.toFixed(2)}deg) scale(${scale})`;
      raf = requestAnimationFrame(tick);
    }
    function onMove(e) {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      rx = dx * max;
      ry = -dy * max;
    }
    function onLeave() { rx = 0; ry = 0; }
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      el.style.transform = '';
    };
  }, []);
  return ref;
}

// ============================================================
// Hero 3D Heart — orbiting gold marks around a beating garnet glow.
// Positioned absolutely in the hero, pointer-events: none so it doesn't
// interfere with the existing CTA cluster.
// ============================================================
function Hero3DHeart() {
  return (
    <div className="hero-3d-wrap" aria-hidden="true">
      <div className="hero-3d">
        <div className="ring ring-1" />
        <div className="ring ring-2" />
        <div className="ring ring-3" />
        <div className="heart-glow" />
        <svg className="heart-core" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21s-7-4.5-9.5-9.2C.7 8.5 2.3 5 5.5 5c1.9 0 3.6 1 4.5 2.5C10.9 6 12.6 5 14.5 5c3.2 0 4.8 3.5 3 6.8C19 16.5 12 21 12 21z" />
        </svg>
        <div className="orbit orbit-1" />
        <div className="orbit orbit-2" />
        <div className="orbit orbit-3" />
      </div>
    </div>
  );
}

// ============================================================
// 3D Architecture Stack — slabs floating in Z, click pip to focus.
// Drop-in alternative to the rail+panel; click a pip OR a slab to switch.
// ============================================================
function ArchStack3D() {
  const layers = window.ESD2_ARCH;
  const [idx, setIdx] = useS6(0);

  // Mouse-driven group tilt (whole stack drifts subtly with cursor).
  const stageRef = useR6(null);
  const stackRef = useR6(null);
  useE6(() => {
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const stage = stageRef.current, stack = stackRef.current;
    if (!stage || !stack) return;
    let raf, tx = 0, ty = 0, cx = 0, cy = 0;
    function tick() {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      stack.style.transform = `rotateX(${(-cy * 6).toFixed(2)}deg) rotateY(${(cx * 10).toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    }
    function onMove(e) {
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5);
      ty = ((e.clientY - r.top) / r.height - 0.5);
    }
    function onLeave() { tx = 0; ty = 0; }
    stage.addEventListener('mousemove', onMove);
    stage.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      stage.removeEventListener('mousemove', onMove);
      stage.removeEventListener('mouseleave', onLeave);
      stack.style.transform = '';
    };
  }, []);

  // Z offsets per slab relative to active
  function transformFor(i) {
    const delta = i - idx;
    if (delta === 0)      return 'translateZ(0px) rotateX(0deg) translateY(0px) scale(1)';
    const z = -120 * Math.abs(delta) - 40;
    const y = delta * 38;
    const r = delta * 4;
    const s = 1 - Math.min(0.18, Math.abs(delta) * 0.05);
    return `translateZ(${z}px) translateY(${y}px) rotateX(${r}deg) scale(${s})`;
  }
  function opacityFor(i) {
    const d = Math.abs(i - idx);
    if (d === 0) return 1;
    if (d === 1) return 0.78;
    if (d === 2) return 0.5;
    return 0.25;
  }
  function zFor(i) {
    return 100 - Math.abs(i - idx);
  }

  function next() { setIdx(i => (i + 1) % layers.length); }
  function prev() { setIdx(i => (i - 1 + layers.length) % layers.length); }

  return (
    <div className="slab-stage" ref={stageRef}>
      <div className="slab-stack" ref={stackRef}>
        {layers.map((l, i) => (
          <div key={l.id}
            className={`slab ${l.tint || ''} ${i === idx ? 'is-active' : ''}`}
            style={{ transform: transformFor(i), opacity: opacityFor(i), zIndex: zFor(i) }}
            onClick={() => setIdx(i)}
            data-cursor="hover">
            <span className="accent-tab">Layer · {String(i + 1).padStart(2, '0')}</span>
            <div className="slab-title">{l.title}</div>
            <div className="slab-sub">{l.short}</div>
            <div className="slab-body">
              {/* Show first 2 items so the slab body stays compact */}
              {l.items.slice(0, 2).map((it, j) => (
                <div key={j} style={{ marginBottom: 6 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}>{it.name}</span>
                  <span style={{ color: 'var(--warm-500)', margin: '0 6px' }}>·</span>
                  <span style={{ color: 'var(--warm-700)' }}>{it.desc.slice(0, 110)}{it.desc.length > 110 ? '…' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="slab-nav">
        <button className="arrow" onClick={prev} data-cursor="hover" aria-label="Previous layer">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        {layers.map((l, i) => (
          <span key={l.id} className={`pip ${i === idx ? 'on' : ''}`}
            onClick={() => setIdx(i)} data-cursor="hover"
            title={l.title} />
        ))}
        <button className="arrow" onClick={next} data-cursor="hover" aria-label="Next layer">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Architecture3DScene — wraps the stack with a scene header + a toggle
// to switch back to the flat rail view for accessibility / reduced motion.
// ============================================================
function Architecture3DScene() {
  const [view, setView] = useS6('3d'); // '3d' | 'flat'

  return (
    <section className="scene" id="architecture">
      <div className="scene-header">
        <div className="left flex-min">
          <span className="t-eyebrow">Data architecture · spatial</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>Six layers, in depth.</h2>
          <p className="t-body">
            Each layer is a glass slab. The stack drifts with the cursor — click a slab or pip to focus
            it. Or switch to the flat rail if you prefer it linear.
          </p>
        </div>
        <div className="seg" role="tablist">
          <button className={`seg-item ${view === '3d' ? 'active' : ''}`} onClick={() => setView('3d')} data-cursor="hover">3D stack</button>
          <button className={`seg-item ${view === 'flat' ? 'active' : ''}`} onClick={() => setView('flat')} data-cursor="hover">Flat rail</button>
        </div>
      </div>

      {view === '3d' ? (
        <Reveal>
          <GlassCard style={{ padding: 0, overflow: 'hidden' }} data-insight="arch-stack">
            <ArchStack3D />
          </GlassCard>
        </Reveal>
      ) : (
        <Reveal><ArchitectureFlat /></Reveal>
      )}
    </section>
  );
}

Object.assign(window, { useTilt, Hero3DHeart, ArchStack3D, Architecture3DScene });
