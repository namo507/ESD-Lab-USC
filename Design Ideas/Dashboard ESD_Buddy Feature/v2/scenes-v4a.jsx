// v4 scenes: Study Aims · Data Architecture · Model Studio · Reading Library update.
// These rebuild on the existing primitives (Reveal, GlassCard, Gloss, Icon).
const { useState: useS4, useMemo: useM4, useEffect: useE4, useRef: useR4 } = React;

// ============================================================
// Study Aims — three expandable cards. Click to expand.
// ============================================================
function AimCard({ aim, isOpen, onToggle }) {
  return (
    <GlassCard className={`aim-card ${aim.tint || ''} ${isOpen ? 'open' : ''}`}
      onClick={onToggle} data-cursor="hover" data-insight={`aim-${aim.n}`}>
      <button className="more" aria-label={isOpen ? 'collapse' : 'expand'} data-cursor="hover">
        <Icon name="plus" size={14} stroke={2} color="var(--usc-garnet)" />
      </button>
      <div className="num">Aim {aim.n}</div>
      <div className="title">{aim.title}</div>
      <span className="window">{aim.window}</span>
      <div className="primary">{aim.primary}</div>
      <div className="expand">
        <div className="field">
          <div className="label">Hypothesis</div>
          <div className="value">{aim.hypothesis}</div>
        </div>
        <div className="field">
          <div className="label">Method</div>
          <div className="value">{aim.method}</div>
        </div>
        <div className="field">
          <div className="label">Outcome</div>
          <div className="value">{aim.outcome}</div>
        </div>
      </div>
    </GlassCard>
  );
}

function AimsScene() {
  const [open, setOpen] = useS4(null);

  return (
    <section className="scene" id="aims">
      <div className="scene-header">
        <div className="left flex-min">
          <span className="t-eyebrow">Specific Aims · NIH R01</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>Three questions, one trajectory.</h2>
          <p className="t-body">
            Bradshaw R01 hypothesizes that early disruptions in <Gloss term="HDA">autonomic regulation of attention</Gloss>
            cascade into the social-communication features of <Gloss term="NANO">autism</Gloss>.
            Three aims, three measurement windows, three analytic frames.
          </p>
        </div>
        <div className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)' }}>click a card to expand</div>
      </div>

      <Reveal>
        <div className="aim-stack">
          {window.ESD2_AIMS.map((a, i) => (
            <AimCard key={a.n} aim={a}
              isOpen={open === i}
              onToggle={() => setOpen(o => o === i ? null : i)} />
          ))}
        </div>
      </Reveal>

      {/* Three-group comparison strip */}
      <Reveal delay={120}>
        <GlassCard style={{ marginTop: 18, padding: '22px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
            <div>
              <span className="t-eyebrow">Three-group design</span>
              <div className="t-h3" style={{ marginTop: 4 }}>Contrasting attention-specific vs. broad ANS dysfunction</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {[
              { code: 'ASIB', n: 30, asd: '~20%', label: 'Autism Sibling', desc: 'Elevated likelihood. Younger siblings of an autistic child.', color: '#5e3776', term: 'ASIB' },
              { code: 'VPT',  n: 200, asd: '~7%', label: 'Very Preterm',   desc: 'Born < 32 weeks gestation. Model for broad ANS dysfunction from birth.', color: '#73000a', term: 'VPT' },
              { code: 'TD',   n: 30, asd: '~2%', label: 'Typically Developing', desc: 'Term-born, no family ASD history. Comparison cohort.', color: '#3d6650', term: 'TD' },
            ].map(g => (
              <div key={g.code} style={{
                padding: 18, borderRadius: 14,
                background: 'rgba(255,255,255,0.55)',
                border: `1px solid ${g.color}33`,
                display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Gloss term={g.term}><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: g.color, fontWeight: 600, letterSpacing: '0.04em', borderBottom: '1px dashed rgba(0,0,0,0.2)' }}>{g.code}</span></Gloss>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--warm-500)' }}>n target {g.n}</span>
                </div>
                <div style={{ fontFamily: 'Source Serif 4, serif', fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{g.label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--warm-700)', lineHeight: 1.5 }}>{g.desc}</div>
                <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: g.color, background: `${g.color}1a`, padding: '3px 9px', borderRadius: 999 }}>
                    ASD outcome {g.asd}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}

function ArchitectureFlat() {
  const [active, setActive] = useS4('devices');
  const layer = window.ESD2_ARCH.find(l => l.id === active);
  return (
    <div className="arch-grid">
      <div className="arch-rail">
        {window.ESD2_ARCH.map((l, i) => (
          <div key={l.id}
            className={`arch-rail-item ${active === l.id ? 'active' : ''} ${l.tint || ''}`}
            onClick={() => setActive(l.id)} data-cursor="hover">
            <div className="step">Layer · {String(i + 1).padStart(2, '0')}</div>
            <div className="name">{l.title}</div>
            <div className="short">{l.short}</div>
          </div>
        ))}
      </div>
      <GlassCard className={`arch-panel ${layer.tint || ''}`}>
        <div className="layer-head">
          <div className="flex-min">
            <span className="t-eyebrow">{layer.short}</span>
            <div className="t-h2" style={{ marginTop: 4 }}>{layer.title}</div>
          </div>
          <div className="t-mono" style={{ fontSize: 11, color: 'var(--warm-500)' }}>
            {layer.items.length} component{layer.items.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="layer-items">
          {layer.items.map((it, i) => (
            <div key={i} className="item-card">
              <span className="name">{it.name}</span>
              <span className="desc">{it.desc}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

// ============================================================
// Data Architecture — left rail of layers, right detail panel.
// ============================================================
function ArchitectureScene() {
  return (
    <section className="scene" id="architecture-flat">
      <div className="scene-header">
        <div className="left flex-min">
          <span className="t-eyebrow">Data architecture</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>From chest to claim.</h2>
          <p className="t-body">
            Six layers transform a heartbeat into a publishable result.
          </p>
        </div>
      </div>
      <Reveal><ArchitectureFlat /></Reveal>
    </section>
  );
}

Object.assign(window, { ArchitectureFlat });

Object.assign(window, { AimsScene, ArchitectureScene });
