import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { logAuditMock } = vi.hoisted(() => ({
  logAuditMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: logAuditMock,
}));

import { fetchAssistantStatus, streamChat } from "@/api/chatApi";

function makeNdjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
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

  it("scrubs user prompts, logs audit before fetch, and parses NDJSON", async () => {
    const order: string[] = [];
    logAuditMock.mockImplementation(async () => {
      order.push("audit");
    });

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      order.push("fetch");

      const body = JSON.parse(String(init?.body));
      expect(body.message).toContain("{{REDACTED:DATE}}");
      expect(body.message).not.toContain("2026-04-25");
      expect(body.history[0].content).toContain("{{REDACTED:MRN}}");

      return makeNdjsonResponse([
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chunks.join("")).toBe("Hello world");
  });

  it("falls back to the legacy JSON chat endpoint", async () => {
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
    for await (const chunk of streamChat("What is HDA?", [])) {
      chunks.push(chunk);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/assistant/chat");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/chat");
    expect(chunks).toEqual(["Legacy reply"]);
  });

  it("normalizes legacy assistant status payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ready: true,
          state: "ready",
          model_id: "bartowski/Qwen2.5-1.5B-Instruct-GGUF",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    global.fetch = fetchMock as typeof global.fetch;

    await expect(fetchAssistantStatus()).resolves.toEqual({
      status: "ready",
      error: null,
      model: "bartowski/Qwen2.5-1.5B-Instruct-GGUF",
    });
  });
});