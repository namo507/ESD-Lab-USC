// AI Assistant — floating chat panel primed with NANO Study context.
// Uses window.claude.complete (built-in, no API key required).
const { useState: useSc1, useRef: useRc1, useEffect: useEc1 } = React;

// Compact knowledge primer the assistant sees on every message.
// Reads the same data the dashboard reads to stay grounded.
function buildSystem() {
  const m = window.ESD2_MODEL || {};
  const aims = (window.ESD2_AIMS || []).map(a =>
    `- Aim ${a.n}: ${a.title} (${a.window}). ${a.primary} HYPOTHESIS: ${a.hypothesis}`
  ).join('\n');
  return `You are the ESD Lab Assistant — an embedded helper inside the NANO Study research dashboard at the University of South Carolina's Early Social Development Lab (Dr. Jessica Bradshaw, PI).

You answer questions about the study, its measurements, results, model, and dashboard. Be concise (2–4 short paragraphs max). Use plain language but never sacrifice precision. Define acronyms once. If asked something genuinely unknowable from the study materials, say so plainly.

STUDY OVERVIEW
The NANO Study is a 5-year NIH R01 longitudinal study of three infant cohorts:
- ASIB (Autism Sibling): younger siblings of children with confirmed ASD; ~20% develop ASD by age 3.
- VPT (Very Preterm): infants born < 32 weeks gestation; broad ANS dysfunction from birth; ~7% ASD outcome.
- TD (Typically Developing): term-born, no family ASD history; ~2% ASD outcome.

Hypothesis: attention-specific ANS dysfunction (not broad ANS dysfunction) predicts later ASD. Contrasting ASIB to VPT tests this — VPT is the "broad dysfunction" model that should NOT cascade to ASD-specific outcomes, while ASIB's HDA disruption should.

KEY MEASURES
- Heart-Defined Attention (HDA): 5-s ECG epochs labeled with one of four phases — orienting, sustained, inattention, termination — driven by HR change against a moving baseline.
- HRV features: RMSSD (vagal tone), HF power (respiratory sinus arrhythmia), SDNN, pNN50, LF/HF.
- Actiheart-5: chest-worn 1024 Hz single-lead ECG, source of every raw recording.
- Head-mounted eye tracking (HMET): naturalistic in-home gaze.

SPECIFIC AIMS
${aims}

DATA ARCHITECTURE (6 layers)
Devices → REDCap metadata → encrypted S3 storage → Preprocess (bandpass, R-peaks, SQI, HDA labeling) → Features parquet (HRV, HDA episodes, joined cohort) → Models (XGBoost risk classifier, mixed-effects coupling model, latent growth curve).

MODEL (Aim 3)
${m.name || 'nano-risk-v0.3'}: ${m.algorithm || 'gradient boosted'}. Trained on ${m.trained_on || '184 infants'}. AUROC ${m.metrics?.auroc ?? 0.899}, F1 ${m.metrics?.f1 ?? 0.853}, ECE ${m.metrics?.ece ?? 0.041}. Features: HRV + HDA composition + demographics + recording quality. SHAP confirms HDA-derived features (especially % time sustained and 3-mo RMSSD) dominate, supporting the "attention-specific ANS dysfunction" hypothesis.

HIPAA / SAFETY
The dashboard is HIPAA-protected. PHI (DOB, MRN, name, address) never leaves the REDCap proxy. All exports are de-identified. Sessions auto-lock after 30 min.

STYLE NOTES
- Refer to the lab as "ESD Lab" and the study as "the NANO Study".
- Do not invent statistics or papers. Cite real ones when asked: Bradshaw 2022 (Child Development Perspectives, developmental cascades framework), Bradshaw et al. 2025 (Advances in Child Development & Behavior vol. 69, autonomic and attentional pathways).
- When asked about something visible on the current page (sliders, gauge, table), describe what the user is seeing.`;
}

const SUGGESTIONS = [
  'What does the HDA gauge tell me?',
  'Why include preterm infants in an autism study?',
  'How is the risk classifier validated?',
  'What is RMSSD and why does it matter?',
  'Walk me through the data pipeline.',
];

function ChatPanel({ open, onClose }) {
  const [messages, setMessages] = useSc1([
    { role: 'bot', text: "Hi — I'm the ESD Lab assistant. Ask me about the NANO Study, what's on screen, or any term you're unsure of." },
  ]);
  const [input, setInput] = useSc1('');
  const [busy, setBusy] = useSc1(false);
  const bodyRef = useRc1(null);

  useEc1(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, busy, open]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    setMessages(m => [...m, { role: 'you', text: q }]);
    setBusy(true);
    try {
      if (!window.claude || !window.claude.complete) {
        setMessages(m => [...m, { role: 'bot', text: "I can't reach the language model from this environment. In the deployed dashboard, this panel is wired to a free Llama-class endpoint via the lab's proxy." }]);
        setBusy(false);
        return;
      }
      // Build a conversational prompt: system primer + recent turns + question.
      const sys = buildSystem();
      const recent = messages.slice(-6).map(m => ({ role: m.role === 'you' ? 'user' : 'assistant', content: m.text }));
      const res = await window.claude.complete({
        messages: [
          { role: 'user', content: sys + '\n\n--- conversation begins ---' },
          ...recent,
          { role: 'user', content: q },
        ],
      });
      setMessages(m => [...m, { role: 'bot', text: res || '(no response)' }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'bot', text: `Sorry — that request failed: ${err.message || err}` }]);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className={`chat-panel ${open ? 'open' : ''}`} role="dialog" aria-label="ESD Lab Assistant">
      <div className="chat-head">
        <div>
          <div className="title">ESD Lab Assistant</div>
          <div className="sub">Grounded in NANO study context</div>
        </div>
        <button className="chat-close" onClick={onClose} aria-label="Close" data-cursor="hover">
          <Icon name="x" size={14} color="var(--warm-600)" />
        </button>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="avatar">{m.role === 'you' ? 'You' : 'AI'}</div>
            <div className="chat-bubble">{m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="chat-msg bot">
            <div className="avatar">AI</div>
            <div className="chat-bubble thinking">thinking<span className="dots"><span>.</span><span>.</span><span>.</span></span></div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map(s => (
            <button key={s} className="chat-suggestion" onClick={() => send(s)} disabled={busy} data-cursor="hover">
              <span className="arrow">→</span>{s}
            </button>
          ))}
        </div>
      )}

      <div className="chat-form">
        <textarea
          className="chat-input"
          rows={1}
          placeholder="Ask about the study…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          data-cursor="text"
        />
        <button className="chat-send" onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send" data-cursor="hover">
          <Icon name="send" size={15} color="currentColor" stroke={1.8} />
        </button>
      </div>
    </div>
  );
}

function ChatFAB({ onOpen }) {
  return (
    <button className="chat-fab" onClick={onOpen} aria-label="Open assistant" data-cursor="hover">
      <Icon name="sparkles" size={20} color="var(--usc-gold)" stroke={2} />
    </button>
  );
}

function AssistantSection({ onOpen }) {
  // Inline preview / entry point inside the page flow
  return (
    <section className="scene" id="assistant">
      <div className="scene-header">
        <div className="left flex-min">
          <span className="t-eyebrow">AI assistant</span>
          <h2 className="t-h1" style={{ marginTop: 8 }}>Ask the lab anything.</h2>
          <p className="t-body">
            A language-model assistant primed with the study's <Gloss term="HDA">protocols</Gloss>, measures, and current model.
            It can explain what you're seeing, define a term, or summarize what an Aim is testing.
          </p>
        </div>
        <Magnetic strength={0.25}>
          <button className="nav-cta" onClick={onOpen} data-cursor="hover">
            <Icon name="sparkles" size={13} color="var(--usc-gold)" /> Open assistant
          </button>
        </Magnetic>
      </div>

      <Reveal>
        <GlassCard style={{ padding: '32px 36px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -50, right: -50, width: 280, height: 280, background: 'radial-gradient(circle, rgba(255,204,0,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, position: 'relative' }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={s} onClick={onOpen} className="chat-suggestion"
                style={{ padding: '16px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-stroke)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--warm-700)' }}
                data-cursor="hover">
                <span className="arrow" style={{ color: 'var(--usc-garnet)', marginRight: 8 }}>›</span>{s}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(0,0,0,0.06)', fontSize: 12, color: 'var(--warm-500)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>The assistant knows the three Aims, the data architecture, the model card, and the glossary on this page.</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--warm-500)', letterSpacing: '0.08em' }}>HIPAA · responses do not access PHI</span>
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}

Object.assign(window, { ChatPanel, ChatFAB, AssistantSection });
