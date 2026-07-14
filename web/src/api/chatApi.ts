import { logAudit } from "@/lib/audit";
import { scrubPhi } from "@/lib/phiScrub";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Provider-oriented assistant states exposed by the dashboard API.
 *
 * Legacy local-model states are normalized at the boundary so UI components do
 * not need to know whether a deployment used an older server contract.
 */
export type AssistantState =
  | "ready"
  | "disabled"
  | "credentials-missing"
  | "provider-unreachable"
  | "rate-limited"
  | "degraded"
  | "timeout"
  | "fallback"
  | "error";

export interface AssistantStatus {
  status: AssistantState;
  error: string | null;
  model: string | null;
  message?: string | null;
  fallback?: boolean;
  freshness?: {
    readings?: {
      last_indexed_at?: string | null;
      total_indexed?: number | null;
      payload_version?: string | null;
    };
    pipeline?: {
      state?: string | null;
      last_event_id?: string | null;
      warnings?: unknown[];
    };
    redcap?: {
      generated_at?: string | null;
      record_count?: number | null;
      anomaly_count?: number | null;
      source?: string | null;
      age_hours?: number | null;
      sla_hours?: number | null;
    };
  };
}

interface AssistantStatusPayload {
  status?: unknown;
  error?: unknown;
  model?: unknown;
  ready?: unknown;
  state?: unknown;
  last_error?: unknown;
  message?: unknown;
  model_id?: unknown;
  reason?: unknown;
  fallback?: unknown;
  freshness?: unknown;
}

interface LegacyChatPayload {
  reply?: unknown;
  error?: unknown;
}

interface ChatStreamChunk {
  /** Only visible answer text is rendered. Provider reasoning fields are ignored. */
  delta?: unknown;
  done?: unknown;
  error?: unknown;
}

const ASSISTANT_STATUS_ENDPOINT = "/api/assistant/status";
const LEGACY_STATUS_ENDPOINT = "/api/chat/status";
const ASSISTANT_CHAT_ENDPOINT = "/api/assistant/chat";
const LEGACY_CHAT_ENDPOINT = "/api/chat";

const SAFE_STATUS_MESSAGES: Record<Exclude<AssistantState, "ready">, string> = {
  disabled: "The assistant is disabled for this deployment.",
  "credentials-missing": "The assistant is not configured for this deployment.",
  "provider-unreachable": "The assistant service is temporarily unreachable.",
  "rate-limited": "The assistant is busy right now. Please try again shortly.",
  degraded: "The assistant is operating in a limited mode.",
  timeout: "The assistant took too long to respond. Please try again.",
  fallback: "The live assistant is unavailable; a limited dashboard fallback is active.",
  error: "The assistant is temporarily unavailable.",
};

const PROVIDER_INTERNAL_DETAIL =
  /(https?:\/\/|api[_ -]?key|authorization:|bearer\s|nvapi-|traceback|stack trace|openai\.|integrate\.api|request[- _]?id|reasoning[- _]?content)/i;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizedStateName(value: unknown): string | null {
  return stringValue(value)?.trim().toLowerCase().replaceAll("_", "-") ?? null;
}

function isFallbackStatus(payload: AssistantStatusPayload, model: string | null): boolean {
  const reason = normalizedStateName(payload.reason);
  const message = stringValue(payload.message)?.toLowerCase() ?? "";
  return payload.fallback === true
    || model === "pages://fallback-assistant"
    || Boolean(reason?.startsWith("upstream-"))
    || message.includes("fallback assistant");
}

function normalizeAssistantState(payload: AssistantStatusPayload, model: string | null): AssistantState {
  if (isFallbackStatus(payload, model)) return "fallback";

  const statusState = normalizedStateName(payload.status);
  const providerState = normalizedStateName(payload.state);
  const raw = providerState ?? statusState;
  if (raw === "ready" || (!raw && payload.ready === true)) return "ready";

  switch (raw) {
    case "disabled":
    case "unloaded":
    case "model-missing":
      return "disabled";
    case "credentials-missing":
    case "credential-missing":
    case "missing-credentials":
      return "credentials-missing";
    case "provider-unreachable":
    case "provider-unavailable":
    case "unreachable":
      return "provider-unreachable";
    case "rate-limited":
    case "rate-limit":
      return "rate-limited";
    case "degraded":
      return "degraded";
    case "timeout":
    case "timed-out":
      return "timeout";
    case "fallback":
      return "fallback";
    default:
      return "error";
  }
}

function normalizeStatus(payload: AssistantStatusPayload): AssistantStatus {
  const model = stringValue(payload.model) ?? stringValue(payload.model_id);
  const status = normalizeAssistantState(payload, model);
  const message = status === "ready" ? null : SAFE_STATUS_MESSAGES[status];

  return {
    status,
    error: message,
    model,
    message,
    fallback: status === "fallback",
    freshness:
      payload.freshness && typeof payload.freshness === "object"
        ? (payload.freshness as AssistantStatus["freshness"])
        : undefined,
  };
}

/** Ready, degraded, and fallback modes can all answer through the same API. */
export function isAssistantUsable(status: AssistantStatus | null | undefined): boolean {
  return status?.status === "ready" || status?.status === "degraded" || status?.status === "fallback";
}

/** Short status copy shared by assistant surfaces; never includes raw provider errors. */
export function assistantStatusLabel(status: AssistantStatus | null | undefined): string {
  switch (status?.status) {
    case "ready":
      return "NVIDIA assistant ready";
    case "degraded":
      return "Assistant degraded · limited mode";
    case "fallback":
      return "Limited fallback active";
    case "disabled":
      return "Assistant disabled";
    case "credentials-missing":
      return "Assistant setup required";
    case "provider-unreachable":
      return "Assistant temporarily unreachable";
    case "rate-limited":
      return "Assistant busy · retry shortly";
    case "timeout":
      return "Assistant response timed out";
    case "error":
      return "Assistant unavailable";
    default:
      return "Checking assistant…";
  }
}

/**
 * Keep server-authored user guidance while refusing provider diagnostics,
 * credentials, endpoints, stack traces, and reasoning metadata.
 */
export function publicAssistantMessage(value: unknown, fallback: string): string {
  const message = stringValue(value);
  if (!message || message.length > 300 || PROVIDER_INTERNAL_DETAIL.test(message)) return fallback;
  return message;
}

function safeRequestError(status?: number): Error {
  if (status === 429) return new Error(SAFE_STATUS_MESSAGES["rate-limited"]);
  if (status === 408 || status === 504) return new Error(SAFE_STATUS_MESSAGES.timeout);
  if (status === 401 || status === 403) return new Error(SAFE_STATUS_MESSAGES["credentials-missing"]);
  if (status && status >= 500) return new Error(SAFE_STATUS_MESSAGES["provider-unreachable"]);
  return new Error("The assistant request could not be completed.");
}

function safeStreamError(value: unknown): Error {
  const normalized = stringValue(value)?.toLowerCase() ?? "";
  if (normalized.includes("rate") && normalized.includes("limit")) return safeRequestError(429);
  if (normalized.includes("timeout") || normalized.includes("timed out")) return safeRequestError(504);
  if (normalized.includes("credential") || normalized.includes("api key")) return safeRequestError(401);
  return new Error("The assistant stream ended unexpectedly. Please try again.");
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "name" in error
      && (error as { name?: unknown }).name === "AbortError",
  );
}

function scrubHistory(history: ChatMessage[]): { messages: ChatMessage[]; redactions: number } {
  let redactions = 0;
  const messages = history.map((message) => {
    if (message.role !== "user") return message;
    const scrubbed = scrubPhi(message.content);
    redactions += scrubbed.redactions.reduce((total, item) => total + item.count, 0);
    return { ...message, content: scrubbed.text };
  });
  return { messages, redactions };
}

async function requestProxy(path: string, accept: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith("/api/")) throw new Error("Assistant requests must use the dashboard API proxy.");
  try {
    return await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        accept,
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw safeRequestError(503);
  }
}

async function requestJson(path: string, init?: RequestInit): Promise<Response> {
  return requestProxy(path, "application/json", init);
}

async function requestNdjson(path: string, init?: RequestInit): Promise<Response> {
  return requestProxy(path, "application/x-ndjson", init);
}

function parseChunks(buffer: string): { remainder: string; deltas: string[]; done: boolean } {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  const deltas: string[] = [];
  let done = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let chunk: ChatStreamChunk;
    try {
      chunk = JSON.parse(trimmed) as ChatStreamChunk;
    } catch {
      throw new Error("The assistant returned an invalid stream. Please try again.");
    }

    if (chunk.error) throw safeStreamError(chunk.error);
    if (typeof chunk.delta === "string" && chunk.delta) deltas.push(chunk.delta);
    if (chunk.done === true) done = true;
  }

  return { remainder, deltas, done };
}

/**
 * Stream a grounded assistant answer through the same-origin dashboard API.
 *
 * The browser never talks to NVIDIA (or any other model provider) directly.
 * `/api` is handled by Vite's local backend proxy, the dashboard server, or the
 * Cloudflare Pages worker. The legacy JSON endpoint remains a compatibility
 * fallback for older deployments.
 */
export async function* streamChat(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal,
  preferredStatus?: AssistantStatus | null,
): AsyncGenerator<string> {
  if (preferredStatus && !isAssistantUsable(preferredStatus)) {
    throw new Error(preferredStatus.error ?? SAFE_STATUS_MESSAGES.error);
  }

  const cleanMessage = scrubPhi(message);
  const cleanHistory = scrubHistory(history);
  const redactions = cleanMessage.redactions.reduce((total, item) => total + item.count, 0)
    + cleanHistory.redactions;

  await logAudit({
    action: "run.trigger",
    scope: "/assistant/chat",
    detail: { redactions },
  });

  const body = JSON.stringify({ message: cleanMessage.text, history: cleanHistory.messages });
  let response = await requestNdjson(ASSISTANT_CHAT_ENDPOINT, {
    method: "POST",
    body,
    signal,
    headers: { "content-type": "application/json" },
  });

  if (response.status === 404 || response.status === 405) {
    response = await requestJson(LEGACY_CHAT_ENDPOINT, {
      method: "POST",
      body,
      signal,
      headers: { "content-type": "application/json" },
    });

    if (!response.ok) throw safeRequestError(response.status);

    let payload: LegacyChatPayload;
    try {
      payload = (await response.json()) as LegacyChatPayload;
    } catch {
      throw new Error("The assistant returned an invalid reply. Please try again.");
    }
    if (payload.error) throw safeStreamError(payload.error);
    if (typeof payload.reply !== "string" || !payload.reply) {
      throw new Error("The assistant returned an empty reply. Please try again.");
    }
    yield payload.reply;
    return;
  }

  if (!response.ok) throw safeRequestError(response.status);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("The assistant returned an empty stream. Please try again.");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseChunks(buffer);
      buffer = parsed.remainder;

      for (const delta of parsed.deltas) yield delta;
      if (parsed.done) return;
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof Error && error.message.startsWith("The assistant")) throw error;
    throw new Error("The assistant stream ended unexpectedly. Please try again.");
  }

  buffer += decoder.decode();
  if (!buffer.trim()) return;

  const parsed = parseChunks(`${buffer}\n`);
  for (const delta of parsed.deltas) yield delta;
}

async function fetchStatusAt(path: string, signal?: AbortSignal): Promise<AssistantStatus> {
  const response = await requestJson(path, { signal });
  if (!response.ok) throw safeRequestError(response.status);
  try {
    return normalizeStatus((await response.json()) as AssistantStatusPayload);
  } catch {
    throw new Error("The assistant returned an invalid status response.");
  }
}

export async function fetchAssistantStatus(signal?: AbortSignal): Promise<AssistantStatus> {
  const response = await requestJson(ASSISTANT_STATUS_ENDPOINT, { signal });
  if (response.status === 404 || response.status === 405) {
    return fetchStatusAt(LEGACY_STATUS_ENDPOINT, signal);
  }
  if (!response.ok) throw safeRequestError(response.status);
  try {
    return normalizeStatus((await response.json()) as AssistantStatusPayload);
  } catch {
    throw new Error("The assistant returned an invalid status response.");
  }
}

/** Kept as the UI-facing name; it now uses only the dashboard/Pages proxy. */
export async function fetchLiveAssistantStatus(signal?: AbortSignal): Promise<AssistantStatus> {
  return fetchAssistantStatus(signal);
}
