import { logAudit } from "@/lib/audit";
import { scrubPhi } from "@/lib/phiScrub";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantStatus {
  status: "ready" | "unloaded" | "fallback" | "error";
  error: string | null;
  model: string | null;
  reason?: string | null;
  message?: string | null;
  fallback?: boolean;
  model_tier?: string | null;
  model_label?: string | null;
  model_license?: string | null;
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
  reason?: unknown;
  fallback?: unknown;
  model_tier?: unknown;
  model_label?: unknown;
  model_license?: unknown;
  ready?: unknown;
  state?: unknown;
  last_error?: unknown;
  message?: unknown;
  model_id?: unknown;
  freshness?: unknown;
}

interface LegacyChatPayload {
  reply?: unknown;
  error?: unknown;
}

interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
}

function isFallbackStatus(
  payload: AssistantStatusPayload,
  model: string | null,
  message: string | null,
  reason: string | null,
): boolean {
  return payload.fallback === true
    || model === "pages://fallback-assistant"
    || (typeof reason === "string" && reason.startsWith("upstream-"))
    || (typeof message === "string" && message.toLowerCase().includes("fallback assistant"));
}

function normalizeStatus(payload: AssistantStatusPayload): AssistantStatus {
  const model =
    typeof payload.model === "string"
      ? payload.model
      : typeof payload.model_id === "string"
        ? payload.model_id
        : null;
  const message = typeof payload.message === "string" ? payload.message : null;
  const reason = typeof payload.reason === "string" ? payload.reason : null;
  const fallback = isFallbackStatus(payload, model, message, reason);

  if (
    payload.status === "ready"
    || payload.status === "unloaded"
    || payload.status === "fallback"
    || payload.status === "error"
  ) {
    const normalizedStatus: AssistantStatus["status"] = fallback && payload.status === "ready"
      ? "fallback"
      : payload.status;
    const status: AssistantStatus = {
      status: normalizedStatus,
      error:
        normalizedStatus === "ready"
          ? null
          : typeof payload.error === "string"
            ? payload.error
            : message,
      model,
      reason,
      message,
      fallback,
      freshness:
        payload.freshness && typeof payload.freshness === "object"
          ? (payload.freshness as AssistantStatus["freshness"])
          : undefined,
    };
    if (typeof payload.model_tier === "string") status.model_tier = payload.model_tier;
    if (typeof payload.model_label === "string") status.model_label = payload.model_label;
    if (typeof payload.model_license === "string") status.model_license = payload.model_license;
    return status;
  }

  const ready = payload.ready === true;
  const state = typeof payload.state === "string" ? payload.state : null;
  const error =
    typeof payload.last_error === "string"
      ? payload.last_error
      : message ?? (typeof payload.error === "string" ? payload.error : null);

  let status: AssistantStatus["status"] = "error";
  if (fallback) {
    status = "fallback";
  } else if (ready) {
    status = "ready";
  } else if (state && ["disabled", "model-missing", "unloaded"].includes(state)) {
    status = "unloaded";
  }

  const statusPayload: AssistantStatus = {
    status,
    error: status === "ready" ? null : error,
    model,
    reason,
    message,
    fallback,
    freshness:
      payload.freshness && typeof payload.freshness === "object"
        ? (payload.freshness as AssistantStatus["freshness"])
        : undefined,
  };
  if (typeof payload.model_tier === "string") statusPayload.model_tier = payload.model_tier;
  if (typeof payload.model_label === "string") statusPayload.model_label = payload.model_label;
  if (typeof payload.model_license === "string") statusPayload.model_license = payload.model_license;
  return statusPayload;
}

function scrubHistory(history: ChatMessage[]): ChatMessage[] {
  return history.map((message) => {
    if (message.role !== "user") return message;
    return {
      ...message,
      content: scrubPhi(message.content).text,
    };
  });
}

async function requestJson(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function requestNdjson(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      accept: "application/x-ndjson",
      ...(init?.headers ?? {}),
    },
  });
}

function parseChunks(buffer: string): { remainder: string; deltas: string[]; done: boolean } {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  const deltas: string[] = [];
  let done = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const chunk = JSON.parse(trimmed) as ChatStreamChunk;
    if (chunk.error) throw new Error(chunk.error);
    if (chunk.delta) deltas.push(chunk.delta);
    if (chunk.done) done = true;
  }

  return { remainder, deltas, done };
}

export async function* streamChat(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const cleanMessage = scrubPhi(message).text;
  const cleanHistory = scrubHistory(history);

  await logAudit({ action: "run.trigger", scope: "/assistant/chat" });

  const body = JSON.stringify({ message: cleanMessage, history: cleanHistory });
  let response = await requestNdjson("/api/assistant/chat", {
    method: "POST",
    body,
    signal,
    headers: { "content-type": "application/json" },
  });

  if (response.status === 404 || response.status === 405) {
    response = await requestJson("/api/chat", {
      method: "POST",
      body,
      signal,
      headers: { "content-type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as LegacyChatPayload;
    if (typeof payload.error === "string") throw new Error(payload.error);
    if (typeof payload.reply !== "string") throw new Error("Assistant reply was empty.");
    yield payload.reply;
    return;
  }

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseChunks(buffer);
    buffer = parsed.remainder;

    for (const delta of parsed.deltas) {
      yield delta;
    }
    if (parsed.done) return;
  }

  const tail = decoder.decode();
  if (tail) buffer += tail;
  if (!buffer.trim()) return;

  const parsed = parseChunks(`${buffer}\n`);
  for (const delta of parsed.deltas) {
    yield delta;
  }
}

export async function fetchAssistantStatus(): Promise<AssistantStatus> {
  let response = await requestJson("/api/assistant/status");

  if (response.status === 404 || response.status === 405) {
    response = await requestJson("/api/chat/status");
  }

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as AssistantStatusPayload;
  return normalizeStatus(payload);
}
