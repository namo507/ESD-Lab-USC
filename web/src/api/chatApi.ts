import { logAudit } from "@/lib/audit";
import { scrubPhi } from "@/lib/phiScrub";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantStatus {
  status: "ready" | "unloaded" | "error";
  error: string | null;
  model: string | null;
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

function normalizeStatus(payload: AssistantStatusPayload): AssistantStatus {
  if (
    payload.status === "ready"
    || payload.status === "unloaded"
    || payload.status === "error"
  ) {
    return {
      status: payload.status,
      error: typeof payload.error === "string" ? payload.error : null,
      model:
        typeof payload.model === "string"
          ? payload.model
          : typeof payload.model_id === "string"
            ? payload.model_id
            : null,
    };
  }

  const ready = payload.ready === true;
  const state = typeof payload.state === "string" ? payload.state : null;
  const error =
    typeof payload.last_error === "string"
      ? payload.last_error
      : typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : null;

  let status: AssistantStatus["status"] = "error";
  if (ready) {
    status = "ready";
  } else if (state && ["disabled", "model-missing", "unloaded"].includes(state)) {
    status = "unloaded";
  }

  return {
    status,
    error: status === "ready" ? null : error,
    model:
      typeof payload.model === "string"
        ? payload.model
        : typeof payload.model_id === "string"
          ? payload.model_id
          : null,
  };
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