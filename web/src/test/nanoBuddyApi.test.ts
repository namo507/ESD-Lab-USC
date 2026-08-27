import { afterEach, describe, expect, it, vi } from "vitest";
import { askNanoBuddy, fetchNanoBuddyStatus, nanoBuddyCitationHref } from "@/api/nanoBuddyApi";

describe("nanoBuddyApi", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts the strict aggregate contract after redacting public-dashboard identifiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: "That request stays on approved secure systems.",
      citations: [],
      used_metrics: [],
      refused: true,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    global.fetch = fetchMock as typeof global.fetch;

    const result = await askNanoBuddy(
      "Email infant@example.org or call 803-555-1212 about NANO-1043 on 2026-07-14.",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("/api/buddy");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(init.body));
    expect(body.context).toEqual({ section: "nano" });
    expect(body.message.match(/\{\{REDACTED:PHI\}\}/g)).toHaveLength(4);
    expect(String(init.body)).not.toContain("NANO-1043");
    expect(String(init.body)).not.toContain("infant@example.org");
    expect(String(init.body)).not.toContain("803-555-1212");
    expect(String(init.body)).not.toContain("2026-07-14");
    expect(result.refused).toBe(true);
    expect(result.answer).toMatch(/secure systems/i);
  });

  it("reads readiness from the dedicated Buddy status contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      state: "degraded",
      ready: true,
      provider_ready: false,
      metrics_available: true,
      documents_available: true,
      model_id: null,
    }), { status: 200 }));
    global.fetch = fetchMock as typeof global.fetch;

    const status = await fetchNanoBuddyStatus();

    expect(fetchMock).toHaveBeenCalledWith("/api/buddy", {
      headers: { accept: "application/json" },
      signal: undefined,
    });
    expect(status).toMatchObject({ status: "ready", error: null, model: null });
  });

  it("normalizes allowlisted citations into repository document links", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: "Use the approved ECG SOP.",
      citations: [{ title: "ECG Processing SOP", path: "docs/ecg_processing_protocol.md", loc: "document" }],
      used_metrics: ["nano.pipeline_summary.qa_passed_sessions"],
      refused: false,
    }), { status: 200 })) as typeof global.fetch;

    const result = await askNanoBuddy("How do I run ECG preprocessing?");

    expect(result.usedMetrics).toEqual(["nano.pipeline_summary.qa_passed_sessions"]);
    expect(result.citations).toEqual([
      { title: "ECG Processing SOP", path: "docs/ecg_processing_protocol.md", loc: "document" },
    ]);
    expect(nanoBuddyCitationHref(result.citations[0]!)).toBe(
      "https://github.com/namo507/ESD-Lab-USC/blob/main/docs/ecg_processing_protocol.md",
    );
    expect(nanoBuddyCitationHref({
      title: "Infant Attention Review",
      path: "ESD Lab readings/Infant Attention Review.pdf",
      loc: "document",
    })).toBe(
      "https://github.com/namo507/ESD-Lab-USC/blob/main/ESD%20Lab%20readings/Infant%20Attention%20Review.pdf",
    );
    expect(nanoBuddyCitationHref({
      title: "NANO reference",
      path: "dashboard/context_skill/references/nano_reference.rst",
      loc: "document",
    })).toBe(
      "https://github.com/namo507/ESD-Lab-USC/blob/main/dashboard/context_skill/references/nano_reference.rst",
    );
    expect(nanoBuddyCitationHref({
      title: "Reading notes",
      path: "esd-lab-readings/reading-notes.txt",
      loc: "document",
    })).toBe(
      "https://github.com/namo507/ESD-Lab-USC/blob/main/esd-lab-readings/reading-notes.txt",
    );
    expect(nanoBuddyCitationHref({
      title: "Traversal",
      path: "docs/../private.md",
      loc: "document",
    })).toBeNull();
    expect(nanoBuddyCitationHref({
      title: "Unsupported",
      path: "esd-lab-readings/script.html",
      loc: "document",
    })).toBeNull();
    expect(nanoBuddyCitationHref({
      title: "Control character",
      path: "docs/unsafe\nname.pdf",
      loc: "document",
    })).toBeNull();
  });
});
