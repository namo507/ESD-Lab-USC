// App shell: scroll-reactive nav, scroll progress, floating dock, atmosphere, root.
const { useState: useSa, useEffect: useEa, useRef: useRa } = React;

// ---------- Nav (hide on scroll-down, show on scroll-up) ----------
function GlassNav({ onAssistant }) {
  const [hidden, setHidden] = useSa(false);
  const [active, setActive] = useSa('overview');
  const lastYRef = useRa(0);

  useEa(() => {
    function onScroll() {
      const y = window.scrollY;
      const goingDown = y > lastYRef.current && y > 120;
      setHidden(goingDown);
      lastYRef.current = y;
      // Active section via fold position
      const sections = ['metrics', 'pipeline', 'qa', 'aims', 'architecture', 'cohort', 'ml', 'studio', 'library', 'assistant'];
      let cur = 'overview';
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) cur = id;
      }
      setActive(cur);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { id: 'overview',     label: 'Overview'   },
    { id: 'aims',         label: 'Aims'       },
    { id: 'architecture', label: 'Pipeline'   },
    { id: 'cohort',       label: 'Cohort'     },
    { id: 'studio',       label: 'Model'      },
    { id: 'library',      label: 'Library'    },
    { id: 'assistant',    label: 'Assistant'  },
  ];

  function go(id) {
    if (id === 'overview') window.scrollTo({ top: 0, behavior: 'smooth' });
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className={`nav ${hidden ? 'hidden' : ''}`}>
      <div className="nav-brand">
        <div className="nav-brand-mark">e</div>
        <div className="nav-brand-text">
          <strong>ESD Lab</strong>
          <small>NANO · UofSC</small>
        </div>
      </div>
      {links.map(l => (
        <a key={l.id} className={`nav-link ${active === l.id ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); go(l.id); }}
          href={`#${l.id}`} data-cursor="hover">
          {l.label}
        </a>
      ))}
      <Magnetic strength={0.3}>
        <button className="nav-cta" data-cursor="hover" onClick={onAssistant}>
          <Icon name="sparkles" size={13} color="var(--usc-gold)" /> Ask the lab
        </button>
      </Magnetic>
    </div>
  );
}

// ---------- Scroll progress bar ----------
function ScrollProgress() {
  const barRef = useRa(null);
  useEa(() => {
    function onScroll() {
      const el = barRef.current; if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, window.scrollY / max));
      el.style.transform = `scaleX(${p})`;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div ref={barRef} className="scroll-progress" />;
}

// ---------- Floating dock (status island) ----------
function FloatingDock({ onAssistant }) {
  const [time, setTime] = useSa(() => new Date());
  useEa(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time_s = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="dock">
      <span className="dock-item">
        <Icon name="shield-check" size={14} color="var(--green)" />
        <Gloss term="HIPAA">HIPAA</Gloss>&nbsp;session · 28 m
      </span>
      <span className="dock-item">
        <span className="dot" style={{ background: 'var(--blue)', boxShadow: '0 0 8px rgba(76,114,176,0.6)' }} />
        run_2026_115_a · hrv
      </span>
      <span className="dock-item t-mono">{time_s}</span>
      <Magnetic strength={0.35}>
        <button className="dock-item" data-cursor="hover" onClick={onAssistant} style={{ background: 'var(--ink)', color: 'var(--cream)' }}>
          <Icon name="sparkles" size={13} color="var(--usc-gold)" /> Ask
        </button>
      </Magnetic>
    </div>
  );
}

// ---------- Atmosphere (drifting blobs + paper grain) ----------
function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
      <div className="blob blob-4" />
    </div>
  );
}

// ---------- Root ----------
function App() {
  const [chatOpen, setChatOpen] = useSa(false);
  useEa(() => {
    if (window.lucide) window.lucide.createIcons();
  });
  useEa(() => {
    // Debounced lucide refresh — typewriter mutations would otherwise re-run constantly
    if (!window.lucide) return;
    let pending = null;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => { pending = null; window.lucide.createIcons(); }, 400);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (pending) clearTimeout(pending); };
  }, []);

  // Esc closes chat
  useEa(() => {
    function onKey(e) { if (e.key === 'Escape') setChatOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Atmosphere />
      <CustomCursor />
      <ScrollProgress />
      <GlassNav onAssistant={() => setChatOpen(true)} />

      <main id="overview">
        <Hero onAssistant={() => setChatOpen(true)} />
        <KPIDeck />
        <AimsScene />
        <Architecture3DScene />
        <PipelineScene />
        <InsightsFlowScene />
        <CohortTable />
        <MLPerformance />
        <ModelStudio />
        <AssistantSection onOpen={() => setChatOpen(true)} />
        <ReadingLibrary />

        <footer style={{
          padding: '60px 5vw 120px', maxWidth: 1480, margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          flexWrap: 'wrap', gap: 24,
          borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: 40,
          position: 'relative', zIndex: 10,
        }}>
          <div>
            <div className="t-eyebrow" style={{ marginBottom: 10 }}>Early Social Development Lab</div>
            <div className="t-h2" style={{ maxWidth: '20ch' }}>
              <Gloss term="NANO">NANO</Gloss>, with care.
            </div>
            <div className="t-body" style={{ marginTop: 8, fontSize: 13.5 }}>
              Institute for Mind &amp; Brain · 1800 Gervais St · Columbia, SC · PI Dr. Jessica Bradshaw
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--warm-500)', lineHeight: 1.8 }}>
            <div>NIH R01 MH123456 · IRB Pro00115234</div>
            <div>Dashboard ESD · v3.0 · 8a3f1c</div>
            <div>© 2026 University of South Carolina</div>
          </div>
        </footer>
      </main>

      <FloatingDock onAssistant={() => setChatOpen(true)} />
      <Buddy />
      <ChatFAB onOpen={() => setChatOpen(true)} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
