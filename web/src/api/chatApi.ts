import { logAudit } from "@/lib/audit";
import { scrubPhi } from "@/lib/phiScrub";
import { defaultLmStudioEndpoint, probeLmStudio, streamCompletion } from "@/lib/lmStudio";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantStatus {
  status: "ready" | "unloaded" | "fallback" | "error";
  error: string | null;
  model: string | null;
  transport?: "edge" | "local-backend" | "lmstudio";
  endpoint?: string | null;
  origin?: string | null;
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

const LOCAL_ASSISTANT_ORIGIN =
  (import.meta.env.VITE_LOCAL_ASSISTANT_URL as string | undefined) ?? "http://127.0.0.1:8080";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function alternateLocalOrigin(origin: string): string | null {
  if (origin.includes("127.0.0.1")) return origin.replace("127.0.0.1", "localhost");
  if (origin.includes("localhost")) return origin.replace("localhost", "127.0.0.1");
  return null;
}

function localAssistantOrigins(): string[] {
  return uniqueStrings([LOCAL_ASSISTANT_ORIGIN, alternateLocalOrigin(LOCAL_ASSISTANT_ORIGIN)]);
}

function alternateLmStudioEndpoint(endpoint: string): string | null {
  if (endpoint.includes("127.0.0.1")) return endpoint.replace("127.0.0.1", "localhost");
  if (endpoint.includes("localhost")) return endpoint.replace("localhost", "127.0.0.1");
  return null;
}

function lmStudioEndpoints(): string[] {
  const primary = defaultLmStudioEndpoint();
  return uniqueStrings([primary, alternateLmStudioEndpoint(primary)]);
}

function isAbsoluteUrl(path: string): boolean {
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(path);
}

function withOrigin(origin: string | null, path: string): string {
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

function requestCredentials(path: string): RequestCredentials {
  return isAbsoluteUrl(path) ? "omit" : "include";
}

function liveAssistantUnavailable(status?: AssistantStatus | null): Error {
  return new Error(
    status?.error
      ?? status?.message
      ?? "No live assistant is available. Start the local dashboard runtime or LM Studio.",
  );
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

function normalizeStatus(
  payload: AssistantStatusPayload,
  transport: AssistantStatus["transport"] = "edge",
  target?: { endpoint?: string | null; origin?: string | null },
): AssistantStatus {
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
      transport,
      endpoint: target?.endpoint ?? null,
      origin: target?.origin ?? null,
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
    transport,
    endpoint: target?.endpoint ?? null,
    origin: target?.origin ?? null,
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
    credentials: requestCredentials(path),
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function requestNdjson(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: requestCredentials(path),
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
  preferredStatus?: AssistantStatus | null,
): AsyncGenerator<string> {
  if (preferredStatus && preferredStatus.status !== "ready") {
    throw liveAssistantUnavailable(preferredStatus);
  }

  if (preferredStatus?.transport === "lmstudio") {
    for await (const chunk of streamCompletion({
      prompt: message,
      history,
      signal,
      endpoint: preferredStatus.endpoint ?? defaultLmStudioEndpoint(),
      model: preferredStatus.model ?? "local-model",
    })) {
      if (chunk.delta) yield chunk.delta;
    }
    return;
  }

  const backendOrigin = preferredStatus?.transport === "local-backend"
    ? (preferredStatus.origin ?? LOCAL_ASSISTANT_ORIGIN)
    : null;
  const cleanMessage = scrubPhi(message).text;
  const cleanHistory = scrubHistory(history);

  await logAudit({ action: "run.trigger", scope: "/assistant/chat" });

  const body = JSON.stringify({ message: cleanMessage, history: cleanHistory });
  let response = await requestNdjson(withOrigin(backendOrigin, "/api/assistant/chat"), {
    method: "POST",
    body,
    signal,
    headers: { "content-type": "application/json" },
  });

  if (response.status === 404 || response.status === 405) {
    response = await requestJson(withOrigin(backendOrigin, "/api/chat"), {
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

async function fetchStatusAt(
  origin: string | null,
  transport: AssistantStatus["transport"],
): Promise<AssistantStatus> {
  let response = await requestJson(withOrigin(origin, "/api/assistant/status"));

  if (response.status === 404 || response.status === 405) {
    response = await requestJson(withOrigin(origin, "/api/chat/status"));
  }

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as AssistantStatusPayload;
  return normalizeStatus(payload, transport, { origin });
}

export async function fetchLmStudioAssistantStatus(endpoint?: string): Promise<AssistantStatus> {
  const resolvedEndpoint = endpoint ?? defaultLmStudioEndpoint();
  const status = await probeLmStudio(resolvedEndpoint);
  return {
    status: status.ready ? "ready" : "error",
    error: status.ready ? null : "LM Studio is not reachable.",
    model: status.model ?? "lmstudio://local-model",
    model_label: status.modelLabel,
    transport: "lmstudio",
    endpoint: status.endpoint,
    message: status.ready ? null : "LM Studio is not reachable.",
    reason: status.ready ? "direct-lmstudio" : "lmstudio-unavailable",
    fallback: false,
  };
}

export async function fetchLiveAssistantStatus(): Promise<AssistantStatus> {
  let edgeStatus: AssistantStatus | null = null;
  try {
    edgeStatus = await fetchStatusAt(null, "edge");
    if (edgeStatus.status === "ready" && !edgeStatus.fallback) {
      return edgeStatus;
    }
  } catch (error) {
    edgeStatus = {
      status: "error",
      error: error instanceof Error ? error.message : "Assistant unavailable.",
      model: null,
      transport: "edge",
      fallback: false,
      message: error instanceof Error ? error.message : "Assistant unavailable.",
      reason: "edge-unavailable",
    };
  }

  for (const endpoint of lmStudioEndpoints()) {
    try {
      return await fetchLmStudioAssistantStatus(endpoint);
    } catch {
      // try next local LM Studio endpoint candidate
    }
  }

  for (const origin of localAssistantOrigins()) {
    try {
      const localStatus = await fetchStatusAt(origin, "local-backend");
      if (localStatus.status === "ready" && !localStatus.fallback) {
        return localStatus;
      }
    } catch {
      // local backend optional
    }
  }

  if (edgeStatus) {
    const message = liveAssistantUnavailable(edgeStatus).message;
    return {
      ...edgeStatus,
      error: message,
      message,
    };
  }

  return {
    status: "error",
    error: "No live assistant is available. Start the local dashboard runtime or LM Studio.",
    model: null,
    transport: "edge",
    fallback: false,
    message: "No live assistant is available. Start the local dashboard runtime or LM Studio.",
    reason: "no-live-assistant",
  };
}

export async function fetchAssistantStatus(): Promise<AssistantStatus> {
  return fetchStatusAt(null, "edge");
}
