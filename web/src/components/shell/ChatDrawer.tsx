import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { RotateCcw, Send, Sparkles, Square, X } from "lucide-react";
import {
  assistantStatusLabel,
  fetchLiveAssistantStatus,
  isAssistantUsable,
  streamChat,
  type AssistantStatus,
  type ChatMessage,
} from "@/api/chatApi";
import {
  askNanoBuddy,
  fetchNanoBuddyStatus,
  nanoBuddyCitationHref,
  scrubNanoBuddyMessage,
  type NanoBuddyCitation,
} from "@/api/nanoBuddyApi";
import { FastPaths, type FastPathPrompt } from "@/components/warm/FastPaths";
import { AmbientOrbit } from "@/components/warm/AmbientOrbit";
import { HELP_ASSISTANT_FAST_PATHS } from "@/data/helpContent";
import { useUi } from "@/store/ui";
import styles from "./ChatDrawer.module.css";

const BUDDY_FAST_PATHS: FastPathPrompt[] = [
  ...HELP_ASSISTANT_FAST_PATHS,
  { lane: "qa",     label: "Explain SQI thresholds",      prompt: "What do the SQI thresholds (0.3 / 0.5 / 0.7) mean for an ECG epoch and how should I QA the borderline tiles?" },
  { lane: "qa",     label: "When to reject an epoch?",    prompt: "Walk me through when I should reject an epoch versus mark it for review. Use the current NANO QA rubric." },
  { lane: "model",  label: "Risk classifier validation",  prompt: "How is the NANO risk classifier validated? Cover AUROC, calibration, and out-of-site holdout." },
  { lane: "model",  label: "HDA gauge explained",         prompt: "What does the HDA gauge on the dashboard tell me, and what triggers a phase shift?" },
  { lane: "model",  label: "SHAP explorer",                prompt: "Explain how to read the SHAP Explorer beeswarm and what participant highlighting changes." },
  { lane: "model",  label: "Model leaderboard",            prompt: "Summarize the Model Leaderboard and which metrics I should compare before trusting a model." },
  { lane: "model",  label: "NVIDIA assistant",               prompt: "How does the NVIDIA-hosted ESD Buddy stay grounded in repository context, and what happens when the assistant is degraded or unavailable?" },
  { lane: "redcap", label: "REDCap PHI handling",         prompt: "Which REDCap fields count as PHI in this study, and how are they stripped before processed/ export?" },
  { lane: "redcap", label: "Participant ID legend",       prompt: "What does the participant ID legend mean for NANO, NICO, ANONICO, and dual-enrolled participants? Explain 5-series versus 9-series and visit markers." },
  { lane: "redcap", label: "Dual forms policy",           prompt: "For a dual-enrolled participant, should AIH and EH be one shared master form or duplicate study-specific forms? Explain the linking ID rule." },
  { lane: "qa",     label: "Next visit packet",           prompt: "Given a participant's role, enrollment type, visit marker, and scheduling risk, how should staff cross-check forms, questionnaires, and packets before scheduling?" },
  { lane: "qa",     label: "Nano rollout plan",           prompt: "Summarize the Nano-first rollout plan, including phases, current priority, and what Nico should wait on." },
  { lane: "qa",     label: "Role handoffs",               prompt: "What should coordinators, grad students, undergrads, and supervisors each own in the lab operations workflow?" },
  { lane: "redcap", label: "Standardize coding",          prompt: "How should the lab standardize REDCap handling, video coding, scoring queues, and draft metrics without overloading staff?" },
  { lane: "redcap", label: "Reporting priorities",        prompt: "Which reporting needs should be prioritized first across demographics, participant projections, and budget-facing work?" },
  { lane: "redcap", label: "Demographic pull plan",       prompt: "How should we review demographic data availability and pull speed for Nano first, then Nico?" },
  { lane: "qa",     label: "Systems audit",               prompt: "What should the systems and workflow audit capture for staff tools, responsibilities, process flows, and data storage?" },
  { lane: "qa",     label: "Budget reporting",            prompt: "How can budget reporting avoid manual deep number crunching while staying realistic and approval-gated?" },
  { lane: "model",  label: "Website integration",         prompt: "What is the current status of https://www.esdlabsc.com relative to internal tracking and reporting workflows?" },
  { lane: "model",  label: "Family-facing guardrails",    prompt: "What is safe to share with families right now, and what should stay exploratory until supervisor/governance review?" },
  { lane: "redcap", label: "Data Explorer",               prompt: "Walk me through the Data Explorer tables, filters, pagination, column visibility, and CSV export guardrails." },
  { lane: "redcap", label: "How to add a new instrument", prompt: "Walk me through adding a new REDCap instrument, including field map, hooks, and double-entry QC." },
  { lane: "redcap", label: "NDA completeness",            prompt: "How should I use the REDCap completeness scorecard before an NDA deadline?" },
  { lane: "redcap", label: "Carry-forward anomalies",     prompt: "How many carry-forward anomalies are active right now, and which R1-R5 codes are present?" },
  { lane: "redcap", label: "R1 flagged records",          prompt: "Which de-identified records are flagged R1, and what does R1 mean?" },
  { lane: "redcap", label: "9m CSBS completeness",        prompt: "Show 9-month CSBS completeness with complete, unverified, incomplete, not-started, skipped, and total counts." },
  { lane: "redcap", label: "REDCap freshness",            prompt: "When was REDCap last synced, how many records were loaded, and was the source redcap-api or synthetic-fallback?" },
  { lane: "redcap", label: "Behind target",               prompt: "Which REDCap event is furthest behind target, and how large is the gap?" },
  { lane: "redcap", label: "Runtime parity",              prompt: "Are Pages, Docker, and K8s serving the same REDCap payload hash right now?" },
  { lane: "redcap", label: "Carry-forward risk",          prompt: "Explain how the carry-forward risk detection works for CSBS surveys across 6m, 9m, 12m, and 24m visits. What R1-R5 conditions trigger a warning, and what should the coordinator do?" },
  { lane: "redcap", label: "Coverage vs completeness",     prompt: "What's the difference between the NDA completeness scorecard and the visit health coverage metric? How should I use each one?" },
  { lane: "redcap", label: "Anomaly triage",               prompt: "A participant has a carry-forward risk flag. Walk me through the triage steps: what to check in the dashboard, what to fix in REDCap, and how to confirm the fix worked." },
  { lane: "qa",     label: "ECG quality monitor",         prompt: "How do I interpret the ECG Quality Monitor grid, SQI colors, and artifact markers?" },
  { lane: "qa",     label: "HDA timeline player",         prompt: "Walk me through the HDA Timeline Player controls and compare mode." },
  { lane: "matlab", label: "How MATLAB hands off",        prompt: "Explain the MATLAB → Parquet → Python merge handoff. Which script writes which file under data/interim/matlab/?" },
  { lane: "matlab", label: "Run all MATLAB exports",      prompt: "Walk me through running MATLAB/scripts/run_all.m end-to-end, including the manifest the dashboard reads." },
  { lane: "matlab", label: "MATLAB Engine vs file",       prompt: "When should I use the MATLAB Engine for Python path instead of the Parquet file handoff?" },
  { lane: "matlab", label: "Processing queue",             prompt: "Explain the MATLAB Processing Queue fields and how artifact rate is derived." },
  { lane: "model",  label: "Publication sync",             prompt: "Explain the Publications feed sync: PubMed, ORCID, Crossref citation count enrichment, auto-tags, and admin trigger behavior." },
  { lane: "model",  label: "Citation export",              prompt: "How does the Publications page export BibTeX and APA citation text without exposing participant data?" },
  { lane: "qa",     label: "Dataset snapshots",            prompt: "Explain dataset snapshots and the Change History route, including diff viewing and PHI redaction." },
  { lane: "model",  label: "CGA river",                     prompt: "Explain how to read the CGA Milestone River, including HDA phase ribbons, group filters, and why sustained attention composition matters." },
  { lane: "redcap", label: "County comparator",             prompt: "Walk me through the County Comparator: URL params, county-level SDoH profile fields, completion deltas, and privacy guardrails." },
  { lane: "qa",     label: "Passport timeline",             prompt: "How do I use the Participant Passport Timeline to review visits, QA flags, REDCap milestones, and pipeline runs for a de-identified participant?" },
  { lane: "model",  label: "Model terrain",                 prompt: "Explain the Model Confidence Terrain contour and heatmap modes, including SHAP interpretation limits." },
  { lane: "model",  label: "Guided explorer",               prompt: "What hypothesis cards are available in Guided Explorer, and where does each card take me?" },
  { lane: "model",  label: "Public insights",               prompt: "Summarize the Public Insights page and what aggregate-only CDC-style charts it includes." },
  { lane: "model",  label: "Executive mode",                prompt: "Explain Executive Mode, the simplified nav, KPI row, and the export summary with live enrollment, HRV, model, and retention tables." },
  { lane: "model",  label: "Executive PPTX export",          prompt: "Walk me through the Executive Mode PPTX export and which slides pull from live hooks vs. stubs." },
  { lane: "qa",     label: "Attrition funnel v2",           prompt: "How should I read the Attrition Funnel v2, including N, retained percent, reason codes, trends, and NIH report copy?" },
  { lane: "dyn",    label: "Co-regulation",                prompt: "Explain how to read the Dyadic Autonomic Co-Regulation page, especially synchrony index, signed lead-lag, coupling stability, and the lag surface ridge." },
  { lane: "dyn",    label: "Multimodal sync windows",       prompt: "Explain the Multimodal Synchrony Visualizer tracks and how the gold synchrony window detection works." },
  { lane: "dyn",    label: "Phase portrait",               prompt: "Walk me through the Arousal-Attention Phase Portrait and what adaptive-region occupancy, recovery time, entropy, and centroid drift mean." },
  { lane: "dyn",    label: "CVA theater",                  prompt: "How should I interpret the CVA Theater gaze ribbons, face-availability gap, CVA bouts, and sticky-look index?" },
  { lane: "dyn",    label: "Still-face suppression",       prompt: "Explain the Still-Face and Suppression Explorer metrics: suppression, recovery, ratio, and blunted suppression flag." },
  { lane: "dyn",    label: "HDA bypass",                   prompt: "Explain the HDA Bypass Index and how orienting-to-termination compares with orienting-to-sustained attention." },
  { lane: "dyn",    label: "Passport",                     prompt: "How do I use the Infant Developmental Passport to review one de-identified participant across modalities?" },
  { lane: "dyn",    label: "Eco-validity",                 prompt: "Summarize the Ecological Validity and Equity Panel and how lab versus home deltas should be interpreted." },
  { lane: "dyn",    label: "Cascade what-if",              prompt: "Explain the Cascade Intervention Simulator guardrails and how slider changes propagate through the fitted paths." },
];

const NANO_DASHBOARD_FAST_PATHS: FastPathPrompt[] = [
  {
    lane: "qa",
    label: "Visits due",
    prompt: "Using only aggregate NANO dashboard metrics, how many visits are due in the next 14 days?",
  },
  {
    lane: "model",
    label: "HDA by window",
    prompt: "Summarize HDA sustained-attention share by available NANO visit windows. Use aggregate metrics only.",
  },
  {
    lane: "redcap",
    label: "REDCap status",
    prompt: "Is the aggregate NANO REDCap sync healthy, and are any double-entry discrepancies open?",
  },
];

interface Message {
  id: string;
  role: "you" | "bot";
  text: string;
  streaming?: boolean;
  interrupted?: boolean;
  retryPrompt?: string;
  citations?: NanoBuddyCitation[];
  usedMetrics?: string[];
  refused?: boolean;
}

type MessageTextBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbers"; items: string[] };

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeHistory(messages: Message[]): ChatMessage[] {
  return messages.slice(-6).map((message) => ({
    role: message.role === "you" ? "user" : "assistant",
    content: message.text,
  }));
}

function withoutRetryPair(messages: Message[], assistantId: string | undefined, question: string): Message[] {
  if (!assistantId) return messages;

  const assistantIndex = messages.findIndex((message) => message.id === assistantId);
  if (assistantIndex < 0) return messages;

  const pairedUserIndex = assistantIndex - 1;
  const pairedUser = messages[pairedUserIndex];
  return messages.filter((_, index) => (
    index !== assistantIndex
    && !(index === pairedUserIndex && pairedUser?.role === "you" && pairedUser.text.trim() === question)
  ));
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "name" in error
      && (error as { name?: unknown }).name === "AbortError",
  );
}

export function parseMessageText(text: string): MessageTextBlock[] {
  const blocks: MessageTextBlock[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push({ kind: "bullets", items: bullets });
    bullets = [];
  };

  const flushNumbers = () => {
    if (!numbers.length) return;
    blocks.push({ kind: "numbers", items: numbers });
    numbers = [];
  };

  const flushLists = () => {
    flushBullets();
    flushNumbers();
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushLists();
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushNumbers();
      bullets.push(bullet[1] ?? "");
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushBullets();
      numbers.push(numbered[1] ?? "");
      continue;
    }

    flushLists();
    paragraph.push(line);
  }

  flushParagraph();
  flushLists();

  return blocks;
}

export function MessageText({ text }: { text: string }) {
  const blocks = parseMessageText(text);

  return (
    <div className={styles.messageText}>
      {blocks.map((block, index) => {
        if (block.kind === "bullets") {
          return (
            <ul key={`bullets-${index}`} className={styles.messageList}>
              {block.items.map((item, itemIndex) => (
                <li key={`${index}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.kind === "numbers") {
          return (
            <ol key={`numbers-${index}`} className={styles.messageList}>
              {block.items.map((item, itemIndex) => (
                <li key={`${index}-${itemIndex}`}>{item}</li>
              ))}
            </ol>
          );
        }

        return (
          <p key={`paragraph-${index}`} className={styles.messageParagraph}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export function ChatDrawer() {
  const inNanoDashboard = typeof window !== "undefined" && window.location.pathname === "/nano/dashboard";
  const fastPaths = inNanoDashboard ? NANO_DASHBOARD_FAST_PATHS : BUDDY_FAST_PATHS;
  const chatOpen = useUi((state) => state.chatOpen);
  const setChatOpen = useUi((state) => state.setChatOpen);
  const consumeChatSeed = useUi((state) => state.consumeChatSeed);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      text: inNanoDashboard
        ? "Hi. I'm ESD Buddy. Ask me about aggregate NANO metrics, study methods, or an approved SOP."
        : "Hi. I'm ESD Buddy. Ask me about the NANO Study, participant operations, REDCap forms, or any term you want unpacked.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusBusy, setStatusBusy] = useState(true);

  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const sendRef = useRef<((text?: string, retryMessageId?: string) => Promise<void>) | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusBusy(true);
    try {
      setStatus(inNanoDashboard
        ? await fetchNanoBuddyStatus()
        : await fetchLiveAssistantStatus());
    } catch (error) {
      setStatus({
        status: "error",
        error: error instanceof Error ? error.message : "Assistant unavailable.",
        model: null,
      });
    } finally {
      setStatusBusy(false);
    }
  }, [inNanoDashboard]);

  useEffect(() => {
    void refreshStatus();
    return () => abortRef.current?.abort();
  }, [refreshStatus]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, busy, chatOpen]);

  const send = useCallback(async (text?: string, retryMessageId?: string) => {
    const enteredQuestion = (text ?? input).trim();
    if (!enteredQuestion || sendingRef.current) return;
    const question = inNanoDashboard
      ? scrubNanoBuddyMessage(enteredQuestion)
      : enteredQuestion;

    sendingRef.current = true;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setBusy(true);

    let assistantId: string | null = null;

    try {
      let liveStatus = status;
      if (!inNanoDashboard && (!liveStatus || statusBusy || !isAssistantUsable(liveStatus))) {
        setStatusBusy(true);
        try {
          liveStatus = await fetchLiveAssistantStatus(controller.signal);
          setStatus(liveStatus);
        } catch (error) {
          liveStatus = {
            status: "error",
            error: error instanceof Error ? error.message : "Assistant unavailable.",
            model: null,
          };
          setStatus(liveStatus);
        } finally {
          setStatusBusy(false);
        }
      }

      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      const baseMessages = withoutRetryPair(messages, retryMessageId, question);
      const history = normalizeHistory(baseMessages);
      const activeAssistantId = makeId("assistant");
      assistantId = activeAssistantId;

      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "38px";
      setMessages((current) => [
        ...withoutRetryPair(current, retryMessageId, question),
        { id: makeId("user"), role: "you", text: question },
        { id: activeAssistantId, role: "bot", text: "", streaming: true },
      ]);

      let reply = "";
      let responseCitations: NanoBuddyCitation[] = [];
      let responseUsedMetrics: string[] = [];
      let responseRefused = false;
      if (inNanoDashboard) {
        const response = await askNanoBuddy(question, controller.signal);
        reply = response.answer;
        responseCitations = response.citations;
        responseUsedMetrics = response.usedMetrics;
        responseRefused = response.refused;
      } else {
        for await (const delta of streamChat(question, history, controller.signal, liveStatus)) {
          reply += delta;
          setMessages((current) =>
            current.map((message) => (
              message.id === activeAssistantId
                ? { ...message, text: reply, streaming: true }
                : message
            )),
          );
        }
      }

      setMessages((current) =>
        current.map((message) => (
          message.id === activeAssistantId
            ? {
                ...message,
                text: reply.trim() || "I don't have enough grounded dashboard context to answer that yet.",
                streaming: false,
                citations: responseCitations,
                usedMetrics: responseUsedMetrics,
                refused: responseRefused,
              }
            : message
        )),
      );
      void refreshStatus();
    } catch (error) {
      if (isAbortError(error)) {
        if (assistantId) {
          setMessages((current) =>
            current.map((entry) => (
              entry.id === assistantId
                ? {
                    ...entry,
                    text: entry.text.trim() || "Response stopped.",
                    streaming: false,
                    interrupted: true,
                    retryPrompt: question,
                  }
                : entry
            )),
          );
        }
        return;
      }

      const message = error instanceof Error ? error.message : "Assistant request failed.";
      if (assistantId) {
        setMessages((current) =>
          current.map((entry) => (
            entry.id === assistantId
              ? { ...entry, text: message, streaming: false, retryPrompt: question }
              : entry
          )),
        );
      }
      setStatus((current) => ({
        status: "error",
        error: message,
        model: current?.model ?? null,
      }));
    } finally {
      setBusy(false);
      sendingRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [inNanoDashboard, input, messages, refreshStatus, status, statusBusy]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (!chatOpen) {
      abortRef.current?.abort();
      return;
    }

    void refreshStatus();

    const timer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    const seed = consumeChatSeed();
    if (seed?.trim()) {
      window.setTimeout(() => {
        void sendRef.current?.(seed);
      }, 0);
    }

    return () => window.clearTimeout(timer);
  }, [chatOpen, consumeChatSeed, refreshStatus]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  }, [send]);

  const onTextareaChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    event.target.style.height = "38px";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 100)}px`;
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const statusTone = statusBusy
    ? "loading"
    : status?.status === "ready"
      ? "ready"
      : isAssistantUsable(status)
        ? "loading"
        : "error";
  const statusLabel = statusBusy
    ? "loading…"
    : inNanoDashboard
      ? status?.status === "ready"
        ? "Aggregate Buddy ready"
        : status?.status === "degraded"
          ? "Buddy limited mode"
          : "Buddy unavailable"
      : assistantStatusLabel(status);
  const redcapFreshness = status?.freshness?.redcap;
  const redcapFreshnessLabel = redcapFreshness?.generated_at
    ? `REDCap ${new Date(redcapFreshness.generated_at).toLocaleDateString()} · ${redcapFreshness.anomaly_count ?? 0} flags${typeof redcapFreshness.age_hours === "number" ? ` · ${redcapFreshness.age_hours.toFixed(1)}h old` : ""}`
    : null;

  return (
    <>
      <aside
        className={`${styles.panel} ${chatOpen ? styles.open : ""}`}
        aria-hidden={!chatOpen}
        aria-label="ESD Buddy"
        role="dialog"
      >
        <div className={styles.head} style={{ position: "relative", overflow: "hidden" }}>
          <AmbientOrbit
            tone="garnet"
            size={140}
            opacity={0.16}
            spin={42}
            style={{ position: "absolute", top: -36, right: -36, pointerEvents: "none" }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className={styles.headTitle}>ESD Buddy</div>
            <div className={styles.headSub}>Grounded in NANO + NICO operations</div>
            <div
              className={styles.statusPill}
              data-insight="assistant-model-clinical"
              data-insight-body="ESD Buddy uses the hosted NVIDIA assistant through the dashboard backend. Prompts are scrubbed before the proxy request, and limited fallback answers remain available when the live provider is degraded."
            >
              <span className={`${styles.statusDot} ${styles[statusTone]}`} aria-hidden />
              <span>{statusLabel}</span>
            </div>
            {redcapFreshnessLabel && (
              <div className={styles.statusPill}>
                <span className={`${styles.statusDot} ${styles.ready}`} aria-hidden />
                <span>{redcapFreshnessLabel}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setChatOpen(false)}
            aria-label="Close assistant"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div
          className={styles.body}
          ref={bodyRef}
          role="log"
          aria-live="polite"
          aria-busy={busy}
        >
          {messages.map((message) => (
            <div key={message.id} className={`${styles.msg} ${message.role === "you" ? styles.you : ""}`}>
              <div className={`${styles.avatar} ${message.role === "you" ? styles.userAvatar : styles.botAvatar}`}>
                {message.role === "you" ? "You" : "AI"}
              </div>
              <div className={`${styles.bubble} ${message.role === "you" ? styles.youBubble : ""} ${message.streaming ? styles.thinking : ""}`}>
                {message.text ? (
                  <MessageText text={message.text} />
                ) : (
                  <span className={styles.dots} aria-label="Assistant is responding">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
                {message.citations?.length ? (
                  <div className={styles.citations} aria-label="Document sources">
                    <span>Document sources</span>
                    {message.citations.map((citation) => {
                      const href = nanoBuddyCitationHref(citation);
                      return href ? (
                        <a
                          key={`${citation.path}-${citation.loc}`}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {citation.title}
                        </a>
                      ) : null;
                    })}
                  </div>
                ) : null}
                {message.usedMetrics?.length ? (
                  <div className={styles.provenance} title={message.usedMetrics.join(", ")}>
                    Live aggregate metrics
                  </div>
                ) : null}
                {message.refused ? (
                  <div className={`${styles.provenance} ${styles.refusal}`}>Protected request refused</div>
                ) : null}
                {message.interrupted && message.text !== "Response stopped." && (
                  <div className={styles.deliveryNote}>Response stopped.</div>
                )}
                {message.retryPrompt && (
                  <div className={styles.responseActions}>
                    <button
                      type="button"
                      className={styles.retryBtn}
                      disabled={busy}
                      onClick={() => void send(message.retryPrompt, message.id)}
                    >
                      <RotateCcw size={12} aria-hidden />
                      Try again
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {messages.length <= 1 && (
          <div className={styles.suggestions}>
            <FastPaths
              tone="light"
              density="compact"
              prompts={fastPaths}
              onSelect={(p) => void send(p)}
            />
          </div>
        )}

        <div className={styles.form}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            rows={1}
            value={input}
            placeholder="Ask about the study…"
            aria-label="Message ESD Buddy"
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className={`${styles.sendBtn} ${busy ? styles.stopBtn : ""}`}
            disabled={!busy && !input.trim()}
            onClick={busy ? stop : () => void send()}
            aria-label={busy ? "Stop response" : "Send message"}
          >
            {busy ? (
              <Square size={12} fill="currentColor" aria-hidden />
            ) : (
              <Send size={15} strokeWidth={1.5} aria-hidden />
            )}
          </button>
        </div>
      </aside>

      <button
        type="button"
        className={styles.fab}
        onClick={() => setChatOpen(!chatOpen)}
        aria-expanded={chatOpen}
        aria-label="Toggle ESD Buddy"
      >
        <Sparkles size={20} strokeWidth={1.5} color="var(--usc-gold)" />
      </button>
    </>
  );
}
