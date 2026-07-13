import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { logAuditMock } = vi.hoisted(() => ({
  logAuditMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: logAuditMock,
}));

import {
  assistantStatusLabel,
  fetchAssistantStatus,
  fetchLiveAssistantStatus,
  isAssistantUsable,
  streamChat,
} from "@/api/chatApi";

function makeNdjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

describe("chatApi", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    logAuditMock.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("scrubs PHI, audits first, ignores reasoning fields, and parses NDJSON", async () => {
    const order: string[] = [];
    logAuditMock.mockImplementation(async () => {
      order.push("audit");
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      order.push("fetch");
      expect(input).toBe("/api/assistant/chat");
      expect(init?.credentials).toBe("include");

      const body = JSON.parse(String(init?.body));
      expect(body.message).toContain("{{REDACTED:DATE}}");
      expect(body.message).not.toContain("2026-04-25");
      expect(body.history[0].content).toContain("{{REDACTED:MRN}}");

      return makeNdjsonResponse([
        JSON.stringify({ reasoning: "private chain of thought" }),
        JSON.stringify({ delta: "Hello " }),
        JSON.stringify({ delta: "world" }),
        JSON.stringify({ done: true }),
      ]);
    });

    global.fetch = fetchMock as typeof global.fetch;

    const chunks: string[] = [];
    for await (const chunk of streamChat("DOB 2026-04-25", [
      { role: "user", content: "mrn 123456" },
      { role: "assistant", content: "ok" },
    ])) {
      chunks.push(chunk);
    }

    expect(order).toEqual(["audit", "fetch"]);
    expect(logAuditMock).toHaveBeenCalledWith({
      action: "run.trigger",
      scope: "/assistant/chat",
      detail: { redactions: 2 },
    });
    expect(chunks.join("")).toBe("Hello world");
    expect(chunks.join("")).not.toContain("chain of thought");
  });

  it("falls back to the legacy same-origin JSON chat endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reply: "Legacy reply" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    global.fetch = fetchMock as typeof global.fetch;

    const chunks: string[] = [];
    for await (const chunk of streamChat("What is HDA?", [])) chunks.push(chunk);

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/assistant/chat",
      "/api/chat",
    ]);
    expect(chunks).toEqual(["Legacy reply"]);
  });

  it("normalizes the legacy status endpoint into an NVIDIA-ready state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ready: true,
          state: "ready",
          model_id: "nvidia/nemotron-3-super-120b-a12b",
          runtime: "nvidia-build-api",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    global.fetch = fetchMock as typeof global.fetch;

    const status = await fetchAssistantStatus();
    expect(status).toEqual({
      status: "ready",
      error: null,
      model: "nvidia/nemotron-3-super-120b-a12b",
      fallback: false,
      freshness: undefined,
      message: null,
    });
    expect(assistantStatusLabel(status)).toBe("NVIDIA assistant ready");
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/assistant/status",
      "/api/chat/status",
    ]);
  });

  it("maps provider states to safe copy without exposing raw provider errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        status: "error",
        state: "rate_limited",
        ready: true,
        error: "NVCF 429 at integrate.api.nvidia.com with key nvapi-secret",
        last_error: "private upstream response",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock as typeof global.fetch;

    const status = await fetchAssistantStatus();
    expect(status.status).toBe("rate-limited");
    expect(status.error).toBe("The assistant is busy right now. Please try again shortly.");
    expect(JSON.stringify(status)).not.toContain("integrate.api.nvidia.com");
    expect(JSON.stringify(status)).not.toContain("nvapi-secret");
    expect(assistantStatusLabel(status)).toBe("Assistant busy · retry shortly");
  });

  it("keeps the Pages fallback usable without probing browser-local providers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        status: "ready",
        ready: true,
        model: "pages://fallback-assistant",
        reason: "upstream-530",
        message: "Pages fallback assistant is active because the live origin is unavailable.",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    global.fetch = fetchMock as typeof global.fetch;

    const status = await fetchLiveAssistantStatus();
    expect(status).toMatchObject({
      status: "fallback",
      fallback: true,
      error: "The live assistant is unavailable; a limited dashboard fallback is active.",
    });
    expect(isAssistantUsable(status)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/assistant/status");
  });

  it("routes ready and fallback chat through the same API and forwards the abort signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("/api/assistant/chat");
      expect(init?.signal).toBe(controller.signal);
      return makeNdjsonResponse([
        JSON.stringify({ delta: "Limited answer" }),
        JSON.stringify({ done: true }),
      ]);
    });
    global.fetch = fetchMock as typeof global.fetch;

    const chunks: string[] = [];
    for await (const chunk of streamChat(
      "What is HDA?",
      [],
      controller.signal,
      {
        status: "fallback",
        error: "The live assistant is unavailable; a limited dashboard fallback is active.",
        model: "pages://fallback-assistant",
        fallback: true,
      },
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Limited answer"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves AbortError when a caller cancels an in-flight proxy request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () => reject(new DOMException("Aborted", "AbortError"));
        if (init?.signal?.aborted) rejectAbort();
        else init?.signal?.addEventListener("abort", rejectAbort, { once: true });
      })
    ));
    global.fetch = fetchMock as typeof global.fetch;

    const pending = streamChat("What is HDA?", [], controller.signal).next();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
