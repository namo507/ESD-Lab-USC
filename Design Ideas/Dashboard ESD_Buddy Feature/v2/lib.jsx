// Library: custom cursor, magnetic hover, reveal observer, primitives.
const { useState: useS, useEffect: useE, useRef: useR, useCallback: useCB, useMemo: useM } = React;

// ---------- Custom cursor (lerp-tracked) ----------
function CustomCursor() {
  const dotRef = useR(null);
  const ringRef = useR(null);

  useE(() => {
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

    const dot = dotRef.current, ring = ringRef.current;
    if (!dot || !ring) return;
    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let dx = mx, dy = my, rx = mx, ry = my;
    let raf;

    function onMove(e) { mx = e.clientX; my = e.clientY; }
    function onDown() { ring.classList.add('hover'); }
    function onUp() { ring.classList.remove('hover'); }

    function tick() {
      dx += (mx - dx) * 0.55;
      dy += (my - dy) * 0.55;
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform = `translate3d(${dx - 3}px, ${dy - 3}px, 0)`;
      ring.style.transform = `translate3d(${rx - 16}px, ${ry - 16}px, 0)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // Hover targets
    function onOver(e) {
      const t = e.target.closest('[data-cursor],a,button,[role="button"],input,[data-magnetic]');
      if (!t) return ring.classList.remove('hover', 'text');
      const kind = t.getAttribute('data-cursor');
      ring.classList.toggle('text', kind === 'text');
      ring.classList.toggle('hover', kind !== 'text');
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseover', onOver, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" />
      <div ref={dotRef} className="cursor-dot" />
    </>
  );
}

// ---------- Magnetic wrapper ----------
function Magnetic({ children, strength = 0.35, className = '', style }) {
  const ref = useR(null);
  useE(() => {
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
    const el = ref.current; if (!el) return;
    let raf, tx = 0, ty = 0, cx = 0, cy = 0;
    function onMove(e) {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * strength;
      ty = (e.clientY - (r.top + r.height / 2)) * strength;
    }
    function onLeave() { tx = 0; ty = 0; }
    function tick() {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      raf = requestAnimationFrame(tick);
    }
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [strength]);
  return <span ref={ref} className={className} data-magnetic style={{ display: 'inline-block', ...style }}>{children}</span>;
}

// ---------- Reveal on scroll ----------
function useReveal() {
  const ref = useR(null);
  useE(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, delay = 0, className = '', style, as: As = 'div' }) {
  const ref = useReveal();
  return <As ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms`, ...style }}>{children}</As>;
}

// ---------- Sheen-on-mouse glass card ----------
function GlassCard({ children, className = '', accent, style, ...rest }) {
  const ref = useR(null);
  function onMove(e) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
  return (
    <div ref={ref} onMouseMove={onMove} className={`glass glass-card ${className}`} style={style} {...rest}>
      {accent && <span className="kpi-accent" style={{ '--accent': accent }} />}
      <span className="sheen" />
      {children}
    </div>
  );
}

// ---------- Tooltip + gloss ----------
function Tooltip({ children, term, text }) {
  const body = term ? window.ESD2_GLOSS[term] || text : text;
  return (
    <span className="tt-wrap">
      {children}
      {body && (
        <span className="tt" role="tooltip">
          {term && <span className="term-tag">{term}</span>}
          {body}
        </span>
      )}
    </span>
  );
}
function Gloss({ term, children }) {
  return <Tooltip term={term}><span className="gloss" data-cursor="text">{children || term}</span></Tooltip>;
}

// ---------- Animated number counter ----------
function Counter({ to, decimals = 0, duration = 1400, start = 0, formatter }) {
  const [v, setV] = useS(start);
  const startedRef = useR(false);
  const elRef = useR(null);

  useE(() => {
    const el = elRef.current; if (!el) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const t0 = performance.now();
          function step(now) {
            const t = Math.min(1, (now - t0) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setV(start + (to - start) * eased);
            if (t < 1) requestAnimationFrame(step);
            else setV(to);
          }
          requestAnimationFrame(step);
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration, start]);

  const txt = formatter
    ? formatter(v)
    : v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={elRef} className="t-num">{txt}</span>;
}

// ---------- Sparkline ----------
function Sparkline({ values, w = 96, h = 32, color = 'var(--usc-garnet)', fill = 'rgba(115,0,10,0.12)' }) {
  if (!values || !values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 3 - ((v - min) / span) * (h - 8);
    return [x, y];
  });
  const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const area = `${d} L ${w - 1} ${h - 1} L 1 ${h - 1} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, display: 'block' }}>
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}

// ---------- Char-rise text wrapper ----------
function CharRise({ text, italicMatch }) {
  // Split into words to keep wrap clean, characters per word for animation.
  const words = text.split(' ');
  let ci = 0;
  return (
    <span className="char-rise">
      {words.map((w, wi) => {
        const isItalic = italicMatch && italicMatch.test(w);
        const chars = [...w].map((c) => {
          const span = (
            <span key={ci} className="ch" style={{ '--ci': ci }}>{c}</span>
          );
          ci++;
          return span;
        });
        return (
          <span key={wi} style={{ whiteSpace: 'nowrap' }} className={isItalic ? 'italic' : ''}>
            {chars}{wi < words.length - 1 && <span className="ch" style={{ '--ci': ci++ }}>&nbsp;</span>}
          </span>
        );
      })}
    </span>
  );
}

// ---------- Typewriter ----------
function Typewriter({ items, speed = 18, idleHold = 1600, restart = 0 }) {
  const [shown, setShown] = useS(0);
  const [chars, setChars] = useS(0);

  useE(() => { setShown(0); setChars(0); }, [restart]);

  useE(() => {
    if (shown >= items.length) {
      const t = setTimeout(() => { setShown(0); setChars(0); }, 5200);
      return () => clearTimeout(t);
    }
    const len = items[shown].text.length;
    if (chars < len) {
      const t = setTimeout(() => setChars(c => c + 1), speed);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => { setShown(s => s + 1); setChars(0); }, idleHold);
      return () => clearTimeout(t);
    }
  }, [shown, chars, items, speed, idleHold]);

  const kindCol = { alert: '#ff8c75', warn: 'var(--usc-gold)', info: '#9bb8e0', ok: '#7dc59a' };

  return (
    <div className="insights-feed">
      {items.slice(0, shown).map((it, i) => (
        <div key={i} className="row fade">
          <span className="glyph">›</span>
          <span><span className="term" style={{ color: kindCol[it.kind] }}>{it.term}</span>{it.text}</span>
        </div>
      ))}
      {shown < items.length && (
        <div className="row">
          <span className="glyph">›</span>
          <span>
            <span className="term" style={{ color: kindCol[items[shown].kind] }}>{items[shown].term}</span>
            {items[shown].text.slice(0, chars)}
            <span className="cursor-blink" />
          </span>
        </div>
      )}
    </div>
  );
}

// ---------- Status pill + group tag ----------
function StatusPill({ status }) {
  const m = window.ESD2_STATUS[status] || { label: status, dot: 'var(--warm-500)' };
  return (
    <span className="status-pill">
      <span className="dot" style={{ background: m.dot }} />{m.label}
    </span>
  );
}
function GroupTag({ group }) {
  const m = window.ESD2_GROUP_STYLE[group] || { color: 'var(--warm-500)' };
  return (
    <Tooltip term={group}>
      <span className="group-tag" style={{ color: m.color, background: 'rgba(255,255,255,0.4)' }} data-cursor>{group}</span>
    </Tooltip>
  );
}

// ---------- Lucide icon ----------
function Icon({ name, size = 16, color = 'currentColor', stroke = 1.5, style }) {
  return <i data-lucide={name} style={{ width: size, height: size, color, strokeWidth: stroke, display: 'inline-flex', ...style }} />;
}

Object.assign(window, {
  CustomCursor, Magnetic, Reveal, useReveal,
  GlassCard, Tooltip, Gloss, Counter, Sparkline,
  CharRise, Typewriter, StatusPill, GroupTag, Icon,
});
