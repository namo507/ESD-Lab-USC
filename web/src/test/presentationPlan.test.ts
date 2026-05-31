import { describe, expect, it } from "vitest";

import {
  DeckPlan,
  PresentationPlanResponse,
  PresentationJobCreated,
  PresentationJobState,
  type DeckPlan as DeckPlanT,
} from "@/api/schemas";
import { presentationJobPollInterval } from "@/api/hooks";
import { mapDeckPlan, deckPlanToSlideDefs, deckFileName, buildPresentation } from "@/lib/pptx";

function makePlan(overrides: Partial<DeckPlanT> = {}): DeckPlanT {
  return {
    title: "Understanding RMSSD",
    subtitle: "A simple, beginner-friendly explainer",
    audience_level: "beginner",
    summary: "RMSSD is a simple marker of vagal tone.",
    disclaimer: null,
    grounded: true,
    citations: ["meta.study.name"],
    concept: "rmssd",
    generated_at: "2026-05-31T00:00:00",
    slides: [
      { id: "title-1", type: "title", title: "Understanding RMSSD", subtitle: "What it tells us", bullets: [], citations: [] },
      { id: "why-2", type: "why", title: "Why this matters", bullets: ["It reflects the nervous system", "It is easy to measure"], citations: [] },
      { id: "concept-3", type: "concept", title: "The core idea", bullets: ["Beat-to-beat variability", "Higher means calmer"], citations: ["enrollment.overall"] },
      { id: "concept-4", type: "concept", title: "How it is computed", bullets: ["Take successive differences", "Square, average, root"], citations: [] },
      { id: "example-5", type: "example", title: "A worked example", bullets: ["Start with five beats"], example: "Walk through five intervals.", citations: [] },
      { id: "recap-6", type: "recap", title: "Recap", bullets: ["One marker", "Easy to read"], citations: [] },
    ],
    ...overrides,
  };
}

describe("Presentation job schemas", () => {
  it("parses a create-job response", () => {
    const parsed = PresentationJobCreated.safeParse({
      job_id: "abc123",
      status: "queued",
      created_at: "2026-05-31T00:00:00",
      progress_message: "Queued — waiting for the local model.",
      poll_after_ms: 900,
    });
    expect(parsed.success).toBe(true);
  });

  it("parses a queued/running poll with no result yet", () => {
    const queued = PresentationJobState.safeParse({ job_id: "j", status: "queued", progress_message: "Queued…", poll_after_ms: 900 });
    const running = PresentationJobState.safeParse({ job_id: "j", status: "running", progress_message: "Composing…", poll_after_ms: 1400 });
    expect(queued.success).toBe(true);
    expect(running.success).toBe(true);
  });

  it("parses a succeeded poll carrying the deck-plan envelope", () => {
    const parsed = PresentationJobState.safeParse({
      job_id: "j",
      status: "succeeded",
      result: { plan: makePlan() },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.result?.plan.slides[0]?.type).toBe("title");
    }
  });

  it("parses a failed poll carrying a clean error and rejects bad status", () => {
    const failed = PresentationJobState.safeParse({ job_id: "j", status: "failed", error: "Generation failed." });
    expect(failed.success).toBe(true);
    const bad = PresentationJobState.safeParse({ job_id: "j", status: "exploded" });
    expect(bad.success).toBe(false);
  });
});

describe("DeckPlan schema", () => {
  it("accepts a well-formed deck plan response", () => {
    const parsed = PresentationPlanResponse.safeParse({ plan: makePlan() });
    expect(parsed.success).toBe(true);
  });

  it("ignores extra envelope keys like status", () => {
    const parsed = PresentationPlanResponse.safeParse({
      plan: makePlan(),
      status: { status: "ready", error: null, model: "local" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a slide with more than five bullets", () => {
    const bad = makePlan({
      slides: [
        { id: "x", type: "concept", title: "Too many", bullets: ["a", "b", "c", "d", "e", "f"], citations: [] },
      ],
    });
    expect(DeckPlan.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown slide type", () => {
    const bad = { ...makePlan(), slides: [{ id: "x", type: "interlude", title: "Nope", bullets: [], citations: [] }] };
    expect(DeckPlan.safeParse(bad).success).toBe(false);
  });

  it("rejects a plan missing its title", () => {
    const { title: _omit, ...rest } = makePlan();
    expect(DeckPlan.safeParse(rest).success).toBe(false);
  });
});

describe("presentationJobPollInterval", () => {
  it("uses server-provided cadence and stops on terminal states", () => {
    expect(presentationJobPollInterval(undefined)).toBe(900);
    expect(presentationJobPollInterval({ status: "queued", poll_after_ms: 750 })).toBe(750);
    expect(presentationJobPollInterval({ status: "running", poll_after_ms: 1800 })).toBe(1800);
    expect(presentationJobPollInterval({ status: "failed" })).toBe(false);
  });
});

describe("mapDeckPlan", () => {
  it("keeps the deck structure: title first, recap last", () => {
    const slides = deckPlanToSlideDefs(makePlan());
    expect(slides[0]?.template).toBe("title");
    expect(slides[0]?.type).toBe("title");
    expect(slides[slides.length - 1]?.type).toBe("recap");
  });

  it("numbers concept kickers and accents title/recap in gold", () => {
    const slides = deckPlanToSlideDefs(makePlan());
    const concepts = slides.filter((s) => s.type === "concept");
    expect(concepts[0]?.eyebrow).toBe("CONCEPT 01");
    expect(concepts[1]?.eyebrow).toBe("CONCEPT 02");
    expect(slides[0]?.accent).toBe("gold");
    expect(slides[slides.length - 1]?.accent).toBe("gold");
    expect(concepts[0]?.accent).toBe("garnet");
  });

  it("derives a callout from worked-example text", () => {
    const slides = deckPlanToSlideDefs(makePlan());
    const example = slides.find((s) => s.type === "example");
    expect(example?.callout?.label).toBe("Worked example");
    expect(example?.callout?.text).toContain("five intervals");
  });

  it("caps bullets at five and passes through grounded citations", () => {
    const deck = mapDeckPlan(makePlan());
    expect(deck.grounded).toBe(true);
    for (const s of deck.slides) expect(s.bullets.length).toBeLessThanOrEqual(5);
    const cited = deck.slides.find((s) => s.citations.length > 0);
    expect(cited?.citations).toContain("enrollment.overall");
  });

  it("builds a safe download filename", () => {
    expect(deckFileName(makePlan())).toBe("understanding-rmssd.pptx");
  });
});

describe("buildPresentation", () => {
  it("produces a real .pptx (zip) payload", async () => {
    const pptx = await buildPresentation(makePlan());
    const base64 = (await pptx.write({ outputType: "base64" })) as string;
    // Base64 of a ZIP file (PPTX is OOXML in a zip) begins with "UEsD" (PK..).
    expect(typeof base64).toBe("string");
    expect(base64.startsWith("UEsD")).toBe(true);
  });
});
