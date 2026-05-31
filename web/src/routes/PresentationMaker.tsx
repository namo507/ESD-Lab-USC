import { useCallback, useMemo, useState } from "react";
import { Badge, Button, Card, SectionLabel, Segmented } from "@/components/primitives";
import { AmbientOrbit } from "@/components/warm";
import { useAssistantStatus, usePresentationJob } from "@/api/hooks";
import { mapDeckPlan, downloadDeck, type DeckSlideDef } from "@/lib/pptx";
import { useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import type { PresentationAudience } from "@/api/schemas";
import styles from "./PresentationMaker.module.css";

/**
 * Simplified Presentation Maker.
 *
 * Turns a single concept into a minimal, easy-to-understand slide deck using
 * the same local GGUF assistant that powers ESD Buddy. The server returns a
 * strict, structured deck plan (/api/presentation/plan); this route previews
 * it as calm slide cards and exports a real .pptx entirely on the client.
 *
 * Visual language mirrors the MATLAB bridge and the rest of the shell: warm
 * ivory surfaces, garnet accents, restrained gold, large serif headings.
 */

const AUDIENCE_OPTIONS: Array<{ value: PresentationAudience; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const SLIDE_COUNT_OPTIONS = ["4", "6", "8"] as const;
type SlideCountChoice = (typeof SLIDE_COUNT_OPTIONS)[number];

function railClass(def: DeckSlideDef): string {
  return def.accent === "gold"
    ? (styles.slideRailGold ?? "")
    : (styles.slideRailGarnet ?? "");
}

export function PresentationMaker() {
  const setChatOpen = useUi((s) => s.setChatOpen);
  const setChatSeed = useUi((s) => s.setChatSeed);

  const [concept, setConcept] = useState("");
  const [audience, setAudience] = useState<PresentationAudience>("beginner");
  const [slideCount, setSlideCount] = useState<SlideCountChoice>("6");
  const [includeAnalogy, setIncludeAnalogy] = useState(true);
  const [includeExample, setIncludeExample] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const status = useAssistantStatus();
  const job = usePresentationJob();

  const assistantReady = status.data?.status === "ready";
  const statusTone = status.isLoading
    ? "loading"
    : assistantReady
      ? "ready"
      : "error";
  const statusLabel = status.isLoading
    ? "checking assistant…"
    : assistantReady
      ? `assistant ready · ${status.data?.model?.split("/").pop() ?? "local model"}`
      : status.data?.status === "unloaded"
        ? "assistant model unavailable"
        : "assistant offline";

  const trimmedConcept = concept.trim();
  const canGenerate = assistantReady && trimmedConcept.length > 0 && !job.isPending;

  const runGenerate = useCallback(() => {
    const value = concept.trim();
    if (!value || !assistantReady || job.isPending) return;
    setDownloadError(null);
    job.start({
      concept: value,
      options: {
        audience_level: audience,
        slide_count: Number(slideCount),
        include_analogy: includeAnalogy,
        include_worked_example: includeExample,
      },
    });
  }, [concept, assistantReady, job, audience, slideCount, includeAnalogy, includeExample]);

  const deck = useMemo(() => (job.data ? mapDeckPlan(job.data.plan) : null), [job.data]);

  const handleDownload = useCallback(async () => {
    if (!job.data) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadDeck(job.data.plan);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Could not build the PPTX file. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  }, [job.data]);

  const askBuddy = useCallback(() => {
    if (!job.data) return;
    const p = job.data.plan;
    const bullets = p.slides
      .flatMap((s) => s.bullets)
      .slice(0, 4)
      .map((b) => `- ${b}`)
      .join("\n");
    const seed =
      `I generated a ${p.audience_level} explainer deck titled "${p.title}" about "${p.concept ?? trimmedConcept}". ` +
      `Summary: ${p.summary}\n\nKey points so far:\n${bullets}\n\n` +
      `Can you expand on this, flag anything inaccurate, and suggest one slide I'm missing?`;
    setChatSeed(seed);
    setChatOpen(true);
    void logAudit({ action: "run.trigger", scope: "/presentation-maker/ask" });
  }, [job.data, trimmedConcept, setChatSeed, setChatOpen]);

  return (
    <div className={styles.page}>
      <header className={styles.hero} data-insight="pm-overview">
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Presentation maker</span>
          <h1 className={styles.h1}>Explain a concept · as a calm, simple deck</h1>
          <p className={styles.lede}>
            Type something you want understood. The local ESD assistant drafts a minimal, easy-to-follow
            slide plan grounded in NANO study context when relevant, and you can preview it here and
            download a real PowerPoint file. Nothing leaves the machine.
          </p>
        </div>
        <div className={styles.statusPill} role="status" aria-live="polite" data-insight="pm-status">
          <span className={`${styles.statusDot} ${styles[statusTone]}`} aria-hidden />
          <span>{statusLabel}</span>
        </div>
      </header>

      {/* ---- Composer ---- */}
      <Card pad={22} dataInsight="pm-composer">
        <div className={styles.composer}>
          <AmbientOrbit tone="garnet" size={150} opacity={0.16} spin={46} className={styles.composerOrbit} />
          <div className={styles.composerInner}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pm-concept">
                What should this deck explain?
              </label>
              <textarea
                id="pm-concept"
                className={styles.textarea}
                placeholder="e.g. How heart-rate defined attention (HDA) works, or what RMSSD tells us about an infant's nervous system…"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                spellCheck
              />
            </div>

            <div className={styles.controls}>
              <div className={styles.control}>
                <span className={styles.controlLabel}>Audience level</span>
                <Segmented<PresentationAudience>
                  ariaLabel="Audience level"
                  size="sm"
                  options={AUDIENCE_OPTIONS}
                  value={audience}
                  onChange={setAudience}
                />
              </div>

              <div className={styles.control}>
                <span className={styles.controlLabel}>Target slides</span>
                <Segmented<SlideCountChoice>
                  ariaLabel="Target slide count"
                  size="sm"
                  options={SLIDE_COUNT_OPTIONS.map((v) => ({ value: v, label: v }))}
                  value={slideCount}
                  onChange={setSlideCount}
                />
              </div>

              <div className={styles.control}>
                <span className={styles.controlLabel}>Analogy slide</span>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeAnalogy}
                    className={`${styles.toggle} ${includeAnalogy ? styles.toggleOn : ""}`}
                    onClick={() => setIncludeAnalogy((v) => !v)}
                  >
                    <span>Include an analogy</span>
                    <span className={styles.toggleKnob} aria-hidden />
                  </button>
                </div>
              </div>

              <div className={styles.control}>
                <span className={styles.controlLabel}>Worked example</span>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeExample}
                    className={`${styles.toggle} ${includeExample ? styles.toggleOn : ""}`}
                    onClick={() => setIncludeExample((v) => !v)}
                  >
                    <span>Include a worked example</span>
                    <span className={styles.toggleKnob} aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.generateRow}>
              <p className={`${styles.hint} ${!assistantReady && !status.isLoading ? styles.hintWarn : ""}`}>
                {assistantReady
                  ? "Calm, non-technical tone by default. Six slides, with analogy and example, is a good place to start."
                  : status.isLoading
                    ? "Checking whether the local assistant is ready…"
                    : `Generation is paused — ${status.data?.error ?? "the local assistant is not available right now."}`}
              </p>
              <Button
                icon="sparkles"
                onClick={runGenerate}
                disabled={!canGenerate}
                aria-label="Generate presentation"
              >
                {job.isPending
                  ? job.phase === "queued"
                    ? "Queued…"
                    : "Generating…"
                  : "Generate presentation"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ---- Progress (queued / generating) ---- */}
      {job.isPending && (
        <Card pad={20} dataInsight="pm-progress">
          <div className={styles.progress}>
            <AmbientOrbit tone="garnet" size={120} opacity={0.18} spin={36} waveform className={styles.progressOrbit} />
            <span className={styles.spinner} aria-hidden />
            <div className={styles.progressBody}>
              <p className={styles.progressTitle}>
                {job.phase === "queued" ? "Queued for the local model…" : "Composing your deck…"}
              </p>
              <p className={styles.progressSub}>
                {job.progressMessage ??
                  `The local model is planning slides for “${trimmedConcept}”.`}{" "}
                You can keep this tab open; it updates on its own.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ---- Error ---- */}
      {job.isError && !job.isPending && (
        <Card pad={18} dataInsight="pm-error">
          <div className={styles.errorCard}>
            <div className={styles.errorBody}>
              <span className={styles.errorTitle}>Generation didn’t complete</span>
              <span className={styles.errorMsg}>
                {job.error ??
                  "The assistant couldn’t return a valid deck plan."}{" "}
                Your concept and settings are still here — try again, or simplify the concept slightly.
              </span>
            </div>
            <Button variant="secondary" icon="refresh-cw" onClick={runGenerate} disabled={!canGenerate}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* ---- Preview ---- */}
      {deck && job.data && !job.isPending && (
        <>
          <Card pad={20} dataInsight="pm-deck">
            <div className={styles.deckHead}>
              <div className={styles.deckTitleWrap}>
                <SectionLabel>Deck preview</SectionLabel>
                <h2 className={styles.deckTitle}>{deck.title}</h2>
                <p className={styles.deckSub}>{deck.subtitle}</p>
              </div>
              <div className={styles.deckMeta}>
                <Badge kind="neutral" size="sm">{deck.audienceLabel}</Badge>
                <Badge kind={deck.grounded ? "ok" : "warn"} size="sm">
                  {deck.grounded ? "grounded in study context" : "general explainer"}
                </Badge>
                <Badge kind="neutral" size="sm">{deck.slides.length} slides</Badge>
              </div>
            </div>
            {deck.disclaimer && (
              <div className={styles.disclaimer} style={{ marginTop: 14 }}>
                <span className={styles.disclaimerDot} aria-hidden>◆</span>
                <span>{deck.disclaimer}</span>
              </div>
            )}
          </Card>

          <section className={styles.slideGrid} aria-label="Slide preview">
            {deck.slides.map((s) => (
              <article
                key={`${s.type}-${s.index}`}
                className={`${styles.slideCard} ${s.template === "title" ? styles.slideTitleSlide : ""}`}
              >
                <span className={`${styles.slideRail} ${railClass(s)}`} aria-hidden />
                <div className={styles.slideEyebrow}>
                  <span className={styles.slideKicker}>{s.eyebrow}</span>
                  <span>{s.index} / {s.total}</span>
                </div>
                <h3 className={styles.slideTitle}>{s.title}</h3>
                {s.subtitle && <p className={styles.slideSubtitle}>{s.subtitle}</p>}
                {s.bullets.length > 0 && (
                  <ul className={styles.slideBullets}>
                    {s.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
                {s.callout && (
                  <div className={styles.callout}>
                    <span className={styles.calloutLabel}>{s.callout.label}</span>
                    {s.callout.text}
                  </div>
                )}
                {s.citations.length > 0 && (
                  <div className={styles.slideCitations}>refs: {s.citations.join(" · ")}</div>
                )}
              </article>
            ))}
          </section>

          <div className={styles.previewActions} data-insight="pm-actions">
            <span className={styles.previewActionsNote}>
              {downloadError
                ? <span className={styles.downloadError}>{downloadError}</span>
                : "Real .pptx · 16:9 · opens in PowerPoint, Keynote, and Google Slides"}
            </span>
            <div className={styles.previewActionsBtns}>
              <Button variant="secondary" icon="message-square" onClick={askBuddy}>
                Ask ESD Buddy
              </Button>
              <Button icon="download" onClick={() => void handleDownload()} disabled={downloading}>
                {downloading ? "Preparing…" : "Download PPTX"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ---- Empty state ---- */}
      {!job.data && !job.isPending && !job.isError && (
        <Card pad={24} dataInsight="pm-empty">
          <div className={styles.empty}>
            <AmbientOrbit tone="garnet" size={96} opacity={0.2} spin={40} waveform />
            <p className={styles.emptyTitle}>Your slide preview will appear here</p>
            <p className={styles.emptySub}>
              Describe a concept above and generate a deck. Try “What is RMSSD?”, “How does the MATLAB
              handoff work?”, or “Explain heart-rate defined attention to a new RA.”
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
