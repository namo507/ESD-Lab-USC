/**
 * Client-side PPTX export for the Presentation Maker.
 *
 * Two layers:
 *  1. `mapDeckPlan` — a *pure* transform from a validated `DeckPlan` into
 *     render-ready slide definitions. No PptxGenJS import, so it is trivially
 *     unit-testable and stays free of any browser/Office runtime.
 *  2. `downloadDeck` — dynamically imports PptxGenJS and turns those slide
 *     definitions into a real 16:9 .pptx that opens cleanly in PowerPoint,
 *     Keynote, and Google Slides. Built from text + simple shapes + dividers
 *     only: no network fonts, no remote images, no clip art.
 */
import type { DeckPlan, DeckSlide, SlideType } from "@/api/schemas";
import { logAudit } from "@/lib/audit";

/** Office-safe palette (hex without leading '#'), derived from tokens.css. */
export const DECK_COLORS = {
  paper: "FAFAF9",
  surface: "FFFFFF",
  ink: "0E1013",
  slate700: "3A3D42",
  slate500: "6B7076",
  slate400: "9A9EA4",
  border: "E6E5E2",
  garnet: "73000A",
  gold: "E0A500", // slightly deepened gold so it stays legible on ivory
} as const;

/** Fonts every target app ships locally — no webfont dependency. */
export const DECK_FONTS = {
  serif: "Georgia",
  sans: "Arial",
} as const;

export type SlideTemplate = "title" | "section" | "recap";

export interface DeckSlideDef {
  /** 1-based position in the deck. */
  index: number;
  total: number;
  /** Visual template to render with. */
  template: SlideTemplate;
  /** Semantic slide type from the plan. */
  type: SlideType;
  /** Small uppercase kicker, e.g. "WHY THIS MATTERS" or "CONCEPT 02". */
  eyebrow: string;
  title: string;
  subtitle?: string;
  bullets: string[];
  /** Optional analogy / worked-example callout. */
  callout?: { label: string; text: string };
  /** Optional speaker note. */
  note?: string;
  /** Grounding references (only present for grounded decks). */
  citations: string[];
  /** Accent colour key for dividers / kickers. */
  accent: "garnet" | "gold";
}

export interface DeckDef {
  title: string;
  subtitle: string;
  audienceLabel: string;
  disclaimer?: string | null;
  grounded: boolean;
  slides: DeckSlideDef[];
}

const EYEBROW_BY_TYPE: Record<SlideType, string> = {
  title: "explainer",
  why: "why this matters",
  concept: "concept",
  analogy: "analogy",
  example: "worked example",
  recap: "recap",
};

function templateForType(type: SlideType): SlideTemplate {
  if (type === "title") return "title";
  if (type === "recap") return "recap";
  return "section";
}

function calloutForSlide(slide: DeckSlide): { label: string; text: string } | undefined {
  if (slide.type === "example" && slide.example) {
    return { label: "Worked example", text: slide.example };
  }
  if (slide.type === "analogy" && slide.analogy) {
    return { label: "Analogy", text: slide.analogy };
  }
  // Concept slides may still carry a supporting example or analogy.
  if (slide.example) return { label: "Example", text: slide.example };
  if (slide.analogy) return { label: "Analogy", text: slide.analogy };
  return undefined;
}

/**
 * Pure mapping from a validated deck plan to render-ready slide definitions.
 *
 * Enforces the deck's visual contract independent of the model: max five
 * bullets per slide, numbered concept kickers, accent assignment, and a
 * per-slide callout derived from example/analogy text.
 */
export function mapDeckPlan(plan: DeckPlan): DeckDef {
  const total = plan.slides.length;
  let conceptCounter = 0;

  const slides: DeckSlideDef[] = plan.slides.map((slide, i) => {
    const template = templateForType(slide.type);
    let eyebrow = EYEBROW_BY_TYPE[slide.type] ?? "concept";
    if (slide.type === "concept") {
      conceptCounter += 1;
      eyebrow = `concept ${String(conceptCounter).padStart(2, "0")}`;
    }
    if (slide.type === "title") {
      eyebrow = `${plan.audience_level} explainer`;
    }

    const accent: "garnet" | "gold" =
      slide.type === "title" || slide.type === "recap" ? "gold" : "garnet";

    const def: DeckSlideDef = {
      index: i + 1,
      total,
      template,
      type: slide.type,
      eyebrow: eyebrow.toUpperCase(),
      title: slide.title,
      bullets: slide.bullets.slice(0, 5),
      citations: slide.citations ?? [],
      accent,
    };

    const subtitle = slide.subtitle ?? (slide.type === "title" ? plan.subtitle : undefined);
    if (subtitle) def.subtitle = subtitle;

    const callout = calloutForSlide(slide);
    if (callout) def.callout = callout;

    if (slide.note) def.note = slide.note;

    return def;
  });

  return {
    title: plan.title,
    subtitle: plan.subtitle,
    audienceLabel: plan.audience_level,
    disclaimer: plan.disclaimer ?? null,
    grounded: plan.grounded,
    slides,
  };
}

/** Convenience accessor used by tests and callers that only need the slides. */
export function deckPlanToSlideDefs(plan: DeckPlan): DeckSlideDef[] {
  return mapDeckPlan(plan).slides;
}

/** Safe, lowercase, hyphenated filename stem for a deck. */
export function deckFileName(plan: DeckPlan): string {
  const stem = (plan.title || plan.concept || "presentation")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "presentation";
  return `${stem}.pptx`;
}

const MARGIN_X = 0.9;
const CONTENT_W = 13.333 - MARGIN_X * 2;

// PptxGenJS is typed loosely here so this module needs no @types beyond the
// library's own declarations, and so the heavy dependency is only pulled into
// a lazy chunk (it is never imported at module-eval time).
type Pptx = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Slide = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function accentHex(accent: "garnet" | "gold"): string {
  return accent === "gold" ? DECK_COLORS.gold : DECK_COLORS.garnet;
}

function renderTitleSlide(slide: Slide, def: DeckSlideDef, deck: DeckDef): void {
  slide.background = { color: DECK_COLORS.paper };

  slide.addText(def.eyebrow, {
    x: MARGIN_X, y: 2.0, w: CONTENT_W, h: 0.4,
    fontFace: DECK_FONTS.sans, fontSize: 13, bold: true,
    color: DECK_COLORS.garnet, charSpacing: 3,
  });
  // Restrained gold rule.
  slide.addShape("rect", {
    x: MARGIN_X, y: 2.5, w: 2.1, h: 0.06, fill: { color: DECK_COLORS.gold }, line: { type: "none" },
  });
  slide.addText(def.title, {
    x: MARGIN_X, y: 2.75, w: CONTENT_W, h: 1.7,
    fontFace: DECK_FONTS.serif, fontSize: 40, bold: true, color: DECK_COLORS.ink,
    align: "left", valign: "top", lineSpacingMultiple: 1.02,
  });
  if (def.subtitle) {
    slide.addText(def.subtitle, {
      x: MARGIN_X, y: 4.55, w: CONTENT_W, h: 1.0,
      fontFace: DECK_FONTS.serif, fontSize: 20, italic: true, color: DECK_COLORS.slate700,
      align: "left", valign: "top",
    });
  }
  const footer = deck.disclaimer
    ? deck.disclaimer
    : "Grounded in ESD Lab / NANO study context.";
  slide.addText(footer, {
    x: MARGIN_X, y: 6.65, w: CONTENT_W, h: 0.6,
    fontFace: DECK_FONTS.sans, fontSize: 11, italic: true, color: DECK_COLORS.slate500,
    align: "left", valign: "top",
  });
}

function renderContentSlide(slide: Slide, def: DeckSlideDef, deck: DeckDef): void {
  slide.background = { color: DECK_COLORS.paper };
  const accent = accentHex(def.accent);

  slide.addText(def.eyebrow, {
    x: MARGIN_X, y: 0.62, w: CONTENT_W, h: 0.35,
    fontFace: DECK_FONTS.sans, fontSize: 12, bold: true, color: accent, charSpacing: 3,
  });
  slide.addText(def.title, {
    x: MARGIN_X, y: 1.0, w: CONTENT_W, h: 1.0,
    fontFace: DECK_FONTS.serif, fontSize: 27, bold: true, color: DECK_COLORS.ink,
    align: "left", valign: "top", lineSpacingMultiple: 1.05,
  });
  // Divider under the heading.
  slide.addShape("rect", {
    x: MARGIN_X, y: 2.0, w: 3.0, h: 0.035,
    fill: { color: accent }, line: { type: "none" },
  });
  if (def.subtitle) {
    slide.addText(def.subtitle, {
      x: MARGIN_X, y: 2.12, w: CONTENT_W, h: 0.5,
      fontFace: DECK_FONTS.sans, fontSize: 14, italic: true, color: DECK_COLORS.slate500,
      align: "left", valign: "top",
    });
  }

  const bulletsY = def.subtitle ? 2.75 : 2.45;
  const bulletsH = def.callout ? 2.7 : 3.7;
  if (def.bullets.length) {
    slide.addText(
      def.bullets.map((b) => ({ text: b, options: { bullet: { code: "2022", indent: 18 } } })),
      {
        x: MARGIN_X, y: bulletsY, w: CONTENT_W, h: bulletsH,
        fontFace: DECK_FONTS.sans, fontSize: 18, color: DECK_COLORS.ink,
        align: "left", valign: "top", lineSpacingMultiple: 1.32, paraSpaceAfter: 8,
      },
    );
  }

  if (def.callout) {
    const calloutY = 5.55;
    slide.addShape("roundRect", {
      x: MARGIN_X, y: calloutY, w: CONTENT_W, h: 1.05, rectRadius: 0.06,
      fill: { color: DECK_COLORS.surface }, line: { color: DECK_COLORS.border, width: 1 },
    });
    // Accent spine on the callout.
    slide.addShape("rect", {
      x: MARGIN_X, y: calloutY, w: 0.07, h: 1.05, fill: { color: accent }, line: { type: "none" },
    });
    slide.addText(
      [
        { text: `${def.callout.label.toUpperCase()}  `, options: { bold: true, color: accent, fontSize: 11, charSpacing: 2 } },
        { text: def.callout.text, options: { color: DECK_COLORS.slate700, fontSize: 14 } },
      ],
      {
        x: MARGIN_X + 0.25, y: calloutY + 0.1, w: CONTENT_W - 0.5, h: 0.85,
        fontFace: DECK_FONTS.sans, align: "left", valign: "middle",
      },
    );
  }

  renderFooter(slide, def, deck);
}

function renderFooter(slide: Slide, def: DeckSlideDef, deck: DeckDef): void {
  slide.addText(deck.title, {
    x: MARGIN_X, y: 7.02, w: CONTENT_W - 1.2, h: 0.35,
    fontFace: DECK_FONTS.sans, fontSize: 9, color: DECK_COLORS.slate400,
    align: "left", valign: "middle",
  });
  slide.addText(`${def.index} / ${def.total}`, {
    x: 13.333 - MARGIN_X - 1.2, y: 7.02, w: 1.2, h: 0.35,
    fontFace: DECK_FONTS.sans, fontSize: 9, color: DECK_COLORS.slate400,
    align: "right", valign: "middle",
  });
  if (def.citations.length) {
    slide.addText(`Refs: ${def.citations.join(" · ")}`, {
      x: MARGIN_X, y: 6.72, w: CONTENT_W, h: 0.28,
      fontFace: DECK_FONTS.sans, fontSize: 8, italic: true, color: DECK_COLORS.slate400,
      align: "left", valign: "middle",
    });
  }
}

function renderSlide(pptx: Pptx, def: DeckSlideDef, deck: DeckDef): void {
  const slide = pptx.addSlide();
  if (def.template === "title") {
    renderTitleSlide(slide, def, deck);
  } else {
    renderContentSlide(slide, def, deck);
  }
  if (def.note) slide.addNotes(def.note);
}

/**
 * Build a PptxGenJS presentation in memory from a validated plan. Exposed for
 * testing the render path without touching the DOM download machinery.
 */
export async function buildPresentation(plan: DeckPlan): Promise<Pptx> {
  const mod = await import("pptxgenjs");
  const PptxGenJS = (mod.default ?? mod) as unknown as { new (): Pptx };
  const pptx = new PptxGenJS();
  pptx.author = "ESD Lab · Presentation Maker";
  pptx.company = "Early Social Development Lab";
  pptx.title = plan.title;
  pptx.layout = "LAYOUT_WIDE"; // 13.333in × 7.5in, 16:9

  const deck = mapDeckPlan(plan);
  for (const def of deck.slides) {
    renderSlide(pptx, def, deck);
  }
  return pptx;
}

/**
 * Generate and download the deck as a real .pptx file. Logs the export action
 * consistent with the app's audit style.
 */
export async function downloadDeck(plan: DeckPlan): Promise<string> {
  const pptx = await buildPresentation(plan);
  const fileName = deckFileName(plan);
  await pptx.writeFile({ fileName });
  void logAudit({ action: "export.pptx", scope: "/presentation-maker" });
  return fileName;
}
