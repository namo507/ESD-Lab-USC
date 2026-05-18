import { describe, expect, it } from "vitest";

import { shouldBypassMock } from "@/api/mockServer";

describe("mockServer assistant passthrough", () => {
  it("bypasses only assistant routes when live assistant is enabled", () => {
    expect(shouldBypassMock("/api/assistant/status", true)).toBe(true);
    expect(shouldBypassMock("/api/assistant/chat", true)).toBe(true);
    expect(shouldBypassMock("/api/chat/status", true)).toBe(true);
    expect(shouldBypassMock("/api/chat", true)).toBe(true);
    expect(shouldBypassMock("/api/study/summary", true)).toBe(false);
    expect(shouldBypassMock("/api/audit", true)).toBe(false);
  });

  it("keeps all routes mocked when live assistant is disabled", () => {
    expect(shouldBypassMock("/api/assistant/status", false)).toBe(false);
    expect(shouldBypassMock("/api/chat", false)).toBe(false);
  });
});