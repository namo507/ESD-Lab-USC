import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { fetchAssistantStatus, streamChat, type AssistantStatus, type ChatMessage } from "@/api/chatApi";
import { FastPaths, type FastPathPrompt } from "@/components/warm/FastPaths";
import { AmbientOrbit } from "@/components/warm/AmbientOrbit";
import { useUi } from "@/store/ui";
import styles from "./ChatDrawer.module.css";

const BUDDY_FAST_PATHS: FastPathPrompt[] = [
  { lane: "qa",     label: "Explain SQI thresholds",      prompt: "What do the SQI thresholds (0.3 / 0.5 / 0.7) mean for an ECG epoch and how should I QA the borderline tiles?" },
  { lane: "qa",     label: "When to reject an epoch?",    prompt: "Walk me through when I should reject an epoch versus mark it for review. Use the current NANO QA rubric." },
  { lane: "model",  label: "Risk classifier validation",  prompt: "How is the NANO risk classifier validated? Cover AUROC, calibration, and out-of-site holdout." },
  { lane: "model",  label: "HDA gauge explained",         prompt: "What does the HDA gauge on the dashboard tell me, and what triggers a phase shift?" },
  { lane: "redcap", label: "REDCap PHI handling",         prompt: "Which REDCap fields count as PHI in this study, and how are they stripped before processed/ export?" },
  { lane: "redcap", label: "How to add a new instrument", prompt: "Walk me through adding a new REDCap instrument, including field map, hooks, and double-entry QC." },
];

interface Message {
  id: string;
  role: "you" | "bot";
  text: string;
  streaming?: boolean;
}

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

export function ChatDrawer() {
  const chatOpen = useUi((state) => state.chatOpen);
  const setChatOpen = useUi((state) => state.setChatOpen);
  const consumeChatSeed = useUi((state) => state.consumeChatSeed);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      text: "Hi — I'm ESD Buddy. Ask me about the NANO Study, what you're seeing on screen, or any term you want unpacked.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusBusy, setStatusBusy] = useState(true);

  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendRef = useRef<((text?: string) => Promise<void>) | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusBusy(true);
    try {
      setStatus(await fetchAssistantStatus());
    } catch (error) {
      setStatus({
        status: "error",
        error: error instanceof Error ? error.message : "Assistant unavailable.",
        model: null,
      });
    } finally {
      setStatusBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    return () => abortRef.current?.abort();
  }, [refreshStatus]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, busy, chatOpen]);

  const send = useCallback(async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;

    const history = normalizeHistory(messages);
    const assistantId = makeId("assistant");
    const controller = new AbortController();

    abortRef.current?.abort();
    abortRef.current = controller;

    setBusy(true);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "38px";
    setMessages((current) => [
      ...current,
      { id: makeId("user"), role: "you", text: question },
      { id: assistantId, role: "bot", text: "", streaming: true },
    ]);

    try {
      let reply = "";
      for await (const delta of streamChat(question, history, controller.signal)) {
        reply += delta;
        setMessages((current) =>
          current.map((message) => (
            message.id === assistantId
              ? { ...message, text: reply, streaming: true }
              : message
          )),
        );
      }

      setMessages((current) =>
        current.map((message) => (
          message.id === assistantId
            ? {
                ...message,
                text: reply.trim() || "I don't have enough grounded dashboard context to answer that yet.",
                streaming: false,
              }
            : message
        )),
      );
      void refreshStatus();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Assistant request failed.";
      setMessages((current) =>
        current.map((entry) => (
          entry.id === assistantId
            ? { ...entry, text: message, streaming: false }
            : entry
        )),
      );
      setStatus((current) => ({
        status: "error",
        error: message,
        model: current?.model ?? null,
      }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, input, messages, refreshStatus]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (!chatOpen) {
      abortRef.current?.abort();
      return;
    }

    const timer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    const seed = consumeChatSeed();
    if (seed?.trim()) {
      window.setTimeout(() => {
        void sendRef.current?.(seed);
      }, 0);
    }

    return () => window.clearTimeout(timer);
  }, [chatOpen, consumeChatSeed]);

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

  const statusTone = statusBusy ? "loading" : status?.status === "ready" ? "ready" : "error";
  const statusLabel = statusBusy
    ? "loading…"
    : status?.status === "ready"
      ? `ready · ${status.model?.split("/").pop() ?? "model"}`
      : status?.status === "unloaded"
        ? "model unavailable"
        : "offline";

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
            <div className={styles.headSub}>Grounded in NANO study context</div>
            <div className={styles.statusPill}>
              <span className={`${styles.statusDot} ${styles[statusTone]}`} aria-hidden />
              <span>{statusLabel}</span>
            </div>
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

        <div className={styles.body} ref={bodyRef}>
          {messages.map((message) => (
            <div key={message.id} className={`${styles.msg} ${message.role === "you" ? styles.you : ""}`}>
              <div className={`${styles.avatar} ${message.role === "you" ? styles.userAvatar : styles.botAvatar}`}>
                {message.role === "you" ? "You" : "AI"}
              </div>
              <div className={`${styles.bubble} ${message.role === "you" ? styles.youBubble : ""} ${message.streaming ? styles.thinking : ""}`}>
                {message.text || (
                  <span className={styles.dots} aria-label="Assistant is thinking">
                    <span />
                    <span />
                    <span />
                  </span>
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
              prompts={BUDDY_FAST_PATHS}
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
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={busy || !input.trim()}
            onClick={() => void send()}
            aria-label="Send message"
          >
            <Send size={15} strokeWidth={1.5} />
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