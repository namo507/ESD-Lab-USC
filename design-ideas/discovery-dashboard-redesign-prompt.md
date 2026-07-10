# Discovery Dashboard — Visual Overhaul Implementation Prompt

> **Purpose:** A self-contained, actionable prompt for implementing a design overhaul of the `/discovery` landing page to match the attached mockup. This prompt targets **only the frontend visual layer** — no backend, API, data, or pipeline logic should be altered. Every instruction references the actual files, tokens, and component hierarchy in the `ESD-Lab-USC` repository.

---

## 0. Design Vision (What the Mockup Shows)

The target design is a **clean, information-dense, single-page ops dashboard** organized into a clear vertical hierarchy:

1. **Sticky top navigation bar** — logo + horizontal page links + search + CTA button
2. **Status ribbon** — study status, enrollment count, date, link
3. **Hero split** — left: editorial text block; right: "Attention Pulse" KPI card with donut chart
4. **KPI strip** — four metric cards in a horizontal row
5. **Three-column analytics zone** — stacked bar chart, pipeline watch table, assistant insight panel
6. **Footer ribbon** — data freshness timestamp + export action

The aesthetic is:
- **Cool-white background** (`#F4F4F6`) with no warm tones
- **Discovery Blue** (`#3366FF`) as the dominant accent — used on nav active states, CTA button, chart fills, progress bars, and donut chart segments
- **Science Blue** (`#91BAF4`) as secondary chart fill (orienting phase)
- **Confident Orange** (`#F57F00`) used **only** sparingly for inattention phase and secondary indicators
- **Optimal Yellow** (`#F4DA26`) used **only** for termination phase in the donut legend
- Cards are **pure white** (`#FFFFFF`) with **subtle blue-tinted borders** (`rgba(51, 102, 255, 0.12)`) and `border-radius: 12px`
- Typography is **Libre Franklin Bold** for headings, **Libre Franklin Medium** for body
- **All-caps tracking labels** for section eyebrows (`ATTENTION PULSE`, `PIPELINE WATCH`, etc.)
- Donut chart for phase distribution (not a bar)
- **No sidebar** on the discovery landing — full-width, magazine-style layout
- **No ECG wave ribbon** visible in the primary viewport — the focus is on aggregate KPIs and charts
- Clean horizontal nav with `Overview | Metrics | Aims | Pipeline | Cohort | Library` links

---

## 1. Brand System Reference (Read-Only — Do NOT Modify)

### 1.1 Source Files

| Asset | Path |
|---|---|
| Brand Guidelines PDF | `ESD Lab Brand Files/10. guidelines/Brand Guidelines.pdf` |
| Logos (2026) | `ESD Lab Brand Files/1. logos/ESD Lab at USC Logos (2026)/` (horizontal, vertical, wordmark, social) |
| Icons (sunburst, star) | `ESD Lab Brand Files/2. icons/` |
| Patterns | `ESD Lab Brand Files/3. patterns/` (brain-duck pattern, wordmark PNGs) |
| Fonts (Libre Franklin) | `ESD Lab Brand Files/9. fonts/` (medium, bold, + italics) |

### 1.2 Active Brand Assets in Web Bundle

| Asset | Path |
|---|---|
| Libre Franklin fonts (TTF) | `web/src/assets/brand-esd/fonts/librefranklin-{bold,bolditalic,medium,mediumitalic}.ttf` |
| Brain-duck pattern (blue) | `web/src/assets/brand-esd/patterns/brain-duck-pattern-discovery-blue.png` |
| Brain-duck pattern (white) | `web/src/assets/brand-esd/patterns/brain-duck-pattern-cool-white.png` |
| Wordmark (blue) | `web/src/assets/brand-esd/patterns/wordmark-blue.png` |
| Wordmark (white) | `web/src/assets/brand-esd/patterns/wordmark-white.png` |

### 1.3 Color Palette (from Brand Guidelines + `brand-esd.css`)

| Name | HEX | CSS Var | Role |
|---|---|---|---|
| Discovery Blue | `#3366FF` | `--brand`, `--blue` | Primary accent, CTA, active nav, chart fills |
| Science Blue | `#91BAF4` | `--ocean` | Secondary chart fill, orienting phase |
| Cool Blue | `#E6EEFC` | `--blue-tint`, `--bg-subtle` | Tint surfaces, selected backgrounds, pill backgrounds |
| Cool White | `#F4F4F6` | `--bg-page`, `--paper` | Page background |
| Deep Blue | `#1B3DBF` | `--brand-800` | Hero title color, termination phase, pressed states |
| White | `#FFFFFF` | `--bg-surface`, `--white` | Card surfaces |
| Ink / Near-Black | `#0A0A0A` | `--ink`, `--slate-900` | Primary text |
| Confident Orange | `#F57F00` | `--accent-orange` | Inattention phase only (sparingly) |
| Firetruck Red | `#D74E2D` | `--accent-red` | Error states only |
| Optimal Yellow | `#F4DA26` | `--accent-yellow`, `--usc-gold` | Termination phase, focus ring |
| Baby Pink | `#F8B2B1` | `--accent-pink` | Decorative only |
| Sage Green | `#2FA36B` | `--green` | Pass/valid/success indicators |

### 1.4 Typography

| Token | Font | Weight | Size | Line-Height | Tracking |
|---|---|---|---|---|---|
| Display (hero) | Libre Franklin | 700 (Bold) | 48px | 1.08 | 0 |
| H1 | Libre Franklin | 700 | 32px | 1.16 | 0 |
| H2 | Libre Franklin | 700 | 24px | 1.16 | 0 |
| H3 | Libre Franklin | 700 | 19px | 1.16 | 0 |
| H4 | Libre Franklin | 700 | 16px | 1.16 | 0 |
| Body | Libre Franklin | 500 (Medium) | 15px | 1.48 | 0 |
| Small | Libre Franklin | 500 | 13px | 1.45 | 0 |
| Micro / Labels | Libre Franklin | 600 | 11px | 1.4 | 0.08em (all-caps) |

---

## 2. Hard Constraints

1. **Backend untouched.** Do not modify anything in `dashboard/server/`, `dashboard/data/`, `src/`, `scripts/build_pages_site.py`, or any Python/pipeline code.
2. **API hooks untouched.** The data hooks in `web/src/api/hooks.ts` and `web/src/api/schemas.ts` must not change. The redesign consumes the same data; it only changes how it's rendered.
3. **Existing garnet/serif dashboard untouched.** The routes under `/overview`, `/participants`, `/qa`, etc. — and the `AppShell` + `Sidebar` + `TopNav` that wrap them — must render identically to today. All changes are scoped under `[data-brand="esd-2026"]` and `[data-discovery-surface="landing"]`.
4. **Additive-only CSS.** Append to `brand-esd.css` or `Landing.module.css`; do not delete or rewrite existing rules in `tokens.css` or `global.css`.
5. **Feature flag gating.** All new visual elements must be within the existing Discovery skin scope (`data-brand="esd-2026"`) and the existing `/discovery` route. The `SkinToggle` already handles switching.
6. **Dark mode must still work.** Every new visual token must have a `[data-theme="dark"]` counterpart.
7. **Mobile responsive.** The mockup is desktop-first, but all cards must stack cleanly at `max-width: 767px`.
8. **Tests must pass.** `npm test -- --run` and `npm run build` in `web/` must succeed after changes.

---

## 3. Files to Modify (Exact Paths)

### 3.1 Primary Style Changes

| File | What to Change |
|---|---|
| `web/src/styles/brand-esd.css` | Add new CSS custom properties and rules for the redesigned card radius (`12px` → `--r-card-lg`), new donut chart tokens, KPI strip grid, pipeline watch table styles, assistant insight card styles. Extend `[data-discovery-surface="landing"]` rules. |
| `web/src/routes/Landing.module.css` | Restyle the hero section, KPI row, three-column analytics zone, and footer ribbon. Add new CSS module classes for the redesigned components: `.heroSplit`, `.kpiStrip`, `.analyticsZone`, `.pipelineWatch`, `.assistantInsight`, `.footerRibbon`. |

### 3.2 Component Changes

| File | What to Change |
|---|---|
| `web/src/routes/Landing.tsx` | Restructure the JSX layout of the discovery landing to match the mockup's vertical hierarchy. The current sections (hero, ECG ribbon, aims, cohort, pipeline, etc.) need to be reorganized into the mockup's condensed format: hero split → KPI strip → analytics zone → footer. |
| `web/src/components/studies/StudyHero.tsx` | Optional — can be reused or replaced by new inline hero markup in Landing.tsx for the discovery skin. |

### 3.3 Potentially New Components (Create if Needed)

| File | Purpose |
|---|---|
| `web/src/components/charts/DonutChart.tsx` | A reusable SVG donut chart for the "Attention Pulse" section showing phase distribution (sustained, orienting, inattention, termination). Use Discovery Blue palette colors. Can be built with plain SVG or `d3.arc()`. |
| `web/src/components/warm/PipelineWatchTable.tsx` | A compact table component matching the mockup's "Pipeline Watch" section — stage name, count, Δ vs 7D with trend arrows. Pulls from existing `useStages()` hook. |
| `web/src/components/warm/AssistantInsightCard.tsx` | A card component for the "Assistant Insight" panel showing summarized text output from the assistant context with a "Ask a follow-up" CTA button. |

### 3.4 Files to NOT Touch

| File | Reason |
|---|---|
| `web/src/styles/tokens.css` | Core design system for the garnet theme |
| `web/src/styles/global.css` | Shared app globals |
| `web/src/components/shell/AppShell.tsx` | Dashboard shell used by non-discovery routes |
| `web/src/components/shell/Sidebar.tsx` | Sidebar navigation for non-discovery routes |
| `web/src/components/shell/TopNav.tsx` | Top navigation for non-discovery routes |
| `web/src/store/ui.ts` | UI state store |
| `web/src/api/*` | All API hooks and schemas |
| `dashboard/server/*` | Backend server |
| `dashboard/data/*` | Data snapshots |

---

## 4. Section-by-Section Design Mapping

### 4.1 Sticky Navigation Bar (Top)

**Mockup:** A horizontal bar with the ESD Lab logo (sunburst + wordmark), inline nav links (`Overview | Metrics | Aims | Pipeline | Cohort | Library`), a search field, and a blue "Ask the lab" CTA button.

**Current state:** The discovery landing already has a sticky nav (`.nav` class in `Landing.module.css`, line 88). It renders the logo, nav links, and theme toggles.

**Changes needed:**
- Refine the nav to match the mockup's tighter layout: logo on left, centered nav links (with active underline in Discovery Blue), search field, and prominent "✦ Ask the lab" pill button on far right
- Active nav link style: blue underline (`border-bottom: 2px solid var(--brand)`), not a background fill
- Search field: light grey background with `Q Search...` placeholder and search icon
- Remove the `Default` / `Dark` toggle buttons from the nav bar (move them to a settings area or keep as-is but visually deprioritize)
- Nav background: `rgba(255, 255, 255, 0.95)` with `backdrop-filter: blur(12px)` and `border-bottom: 1px solid rgba(51, 102, 255, 0.08)`
- Nav `border-radius`: use `0` for the top bar (full-width, not pill-shaped)

**CSS target:** Override `.nav` styles in `Landing.module.css` under the discovery scope, or add new discovery-specific nav selectors in `brand-esd.css`.

### 4.2 Status Ribbon

**Mockup:** A thin horizontal bar below the nav showing: `● NANO Study · Actively Enrolling · 231 / 260 infants` (left) + `As of Jul 9, 2026` (center-left, blue text) + `View study details →` (right).

**Current state:** The discovery landing has a `.statusBanner` class (line ~587 in `brand-esd.css`) that renders similar content.

**Changes needed:**
- Tighten the layout to a single horizontal line
- Green dot (`●`) for active status, then text in `--fg2`
- Date in Discovery Blue (`--brand`)
- Right-aligned link in `--brand` with arrow
- Background: `var(--bg-page)` (no card, just a divider line above and below)
- Font: `--text-small` (13px), Libre Franklin Medium

### 4.3 Hero Split Section

**Mockup:** A two-column layout:
- **Left column (~55%):** Eyebrow label "NANO STUDY" (blue, all-caps, 11px), large title "The heartbeat of every baby's first year." (32–36px, bold, near-black), body paragraph, and "Learn more about the NANO Study →" link in Discovery Blue
- **Right column (~45%):** "ATTENTION PULSE" card — a prominent blue-background card with white text showing 70.1% large stat, a donut chart, and a VPT progress bar

**Current state:** The existing hero section in `Landing.tsx` has a left/right split with the hero text and the "Attention Pulse" signal card.

**Changes needed:**
- **Left side:** Simplify the hero text. Remove the oversized display-size title (currently "The heartbeat of every baby's first year." at ~72px). Reduce to ~36px, weight 700, color `#0A0A0A`. Add the eyebrow "NANO STUDY" with the blue sunburst icon.
- **Right side (Attention Pulse card):**
  - Background: solid Discovery Blue gradient (`linear-gradient(135deg, #3366FF 0%, #2450E6 100%)`)
  - Large stat `70.1%` in white, ~56px, bold
  - Subtitle "LABELED WINDOWS IN SUSTAINED ATTENTION" in white, all-caps, 11px
  - Description text in white with ~80% opacity
  - **Donut chart** (SVG): a ring chart showing phase distribution. Colors:
    - Sustained: Discovery Blue (`#3366FF`) — shown as dark segment
    - Orienting: Science Blue (`#91BAF4`)
    - Inattention: Confident Orange (`#F57F00`)
    - Termination: Optimal Yellow (`#F4DA26`)
  - Legend: right of the donut, four rows with colored dots and percentage labels
  - VPT progress bar at the bottom: `--brand` fill on `--blue-tint` track, with "70%" label
  - Card `border-radius: 12px`, `overflow: hidden`

**Data source:** `useStudySummary()` for enrollment, `useHdaDist()` for phase percentages, existing hooks.

### 4.4 KPI Metric Strip

**Mockup:** Four cards in a horizontal row, each with:
- A circular icon (outlined, blue stroke) on the left
- A large bold number (e.g., "231 / 260", "44.0 ms", "7,131", "97.5%")
- A label below the number (e.g., "Enrolled infants", "RMSSD (median)", "EEG epochs labeled", "QA agreement")
- A link below ("View cohort →", "View HRV metrics →", etc.)

**Current state:** The discovery landing already renders four KPI cards in a `heroMiniCards` grid.

**Changes needed:**
- Card style: white background, `border: 1px solid rgba(51, 102, 255, 0.1)`, `border-radius: 12px`, `padding: 24px`, `box-shadow: 0 1px 3px rgba(0,0,0,0.04)`
- Icon: a circular container (`48px`, `border: 1.5px solid var(--brand)`, `border-radius: 50%`) with a Lucide icon inside (use existing `Icon` component with `strokeWidth={1.5}` and `color="var(--brand)"`)
- Number: `font-size: 36px`, `font-weight: 700`, `color: var(--ink)`, tabular-nums
- Unit suffix (e.g., "ms"): `font-size: 18px`, `font-weight: 500`, `color: var(--fg3)`
- Label: `font-size: 13px`, `color: var(--fg3)`
- Link: `font-size: 13px`, `color: var(--brand)`, with `→` arrow
- Grid: `display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px`
- On mobile (`max-width: 767px`): `grid-template-columns: repeat(2, 1fr)`

**Data source:** Same hooks as current — `useStudySummary()`, `useHdaDist()`, existing metrics.

### 4.5 Three-Column Analytics Zone

This is the densest section. Three panels side by side:

#### 4.5.1 Attention Phase Timeline (Left, ~50% width)

**Mockup:** A stacked bar chart showing attention phase distribution over time, with:
- Eyebrow: "ATTENTION PHASE TIMELINE" (all-caps, 11px, bold)
- Subtitle: "Percent of labeled windows by phase"
- Filter controls: dropdown "All infants ▾", toggle group "7D | 30D | 90D | All" with `30D` active (blue fill)
- Stacked bars: Sustained (blue), Orienting (light blue), Inattention (orange), Termination (dark blue)
- X-axis: date labels (Jun 10, Jun 15, etc.)
- Y-axis: 0–100% scale
- Legend: four colored dots with labels below the chart
- Link: "See full attention analytics →"

**Current state:** The discovery landing has an attention phase timeline section. The chart component exists.

**Changes needed:**
- Card container: white, `border-radius: 12px`, `border: 1px solid rgba(51,102,255,0.1)`
- Eyebrow style: `letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; font-weight: 700`
- Filter pills: use `Segmented` primitive component, styled with Discovery Blue active state
- Chart colors mapped to brand palette:
  - Sustained: `var(--landing-phase-sustained)` → `#3366FF`
  - Orienting: `var(--landing-phase-orienting)` → `#91BAF4`
  - Inattention: `var(--landing-phase-inattention)` → `#F57F00`
  - Termination: `var(--landing-phase-termination)` → `#1B3DBF`
- Chart bars: `border-radius: 2px` on top corners
- Three-dot overflow menu (⋮) in the top right

#### 4.5.2 Pipeline Watch (Center, ~25% width)

**Mockup:** A compact table card:
- Eyebrow: "PIPELINE WATCH" (all-caps) + "View pipeline" link (right-aligned, blue)
- Table: three columns — `Stage`, `Count`, `Δ vs 7D`
- Rows: Ingested / Preprocessed / HDA Labeled / HRV Extracted / QA Passed / Model Output
- Count values right-aligned, delta values in green with ↑ arrows
- Link: "See pipeline metrics →"

**Current state:** The discovery landing has a "Pipeline Watch" table in the same area.

**Changes needed:**
- Card: white, `border-radius: 12px`, matching border/shadow
- Table: clean rows with subtle bottom borders (`1px solid rgba(51,102,255,0.06)`)
- Stage labels: `font-size: 13px`, `color: var(--fg2)`
- Count values: `font-size: 13px`, `font-weight: 600`, `color: var(--ink)`, tabular-nums
- Delta values: `font-size: 12px`, `color: var(--green)`, with `↑` arrow
- Row hover: `background: var(--bg-subtle)` transition

**Data source:** `useStages()` hook — already provides stage names, done counts, and inflight numbers.

#### 4.5.3 Assistant Insight (Right, ~25% width)

**Mockup:** A card with:
- Eyebrow: "ASSISTANT INSIGHT" + blue "New" badge
- A sunburst/star icon (Discovery Blue) above the text
- Two text blocks: summary of sustained attention trend and RMSSD stability
- A "💬 Ask a follow-up" button (outlined, Discovery Blue border)
- Footer: "Insights use data through Jul 9, 2026."

**Current state:** The discovery landing has an "Assistant Insight" section that shows similar content.

**Changes needed:**
- Card: white, `border-radius: 12px`, matching border/shadow
- Badge: `background: var(--brand)`, white text, `border-radius: 4px`, `font-size: 10px`
- Icon: use the sunburst/star SVG from brand assets, rendered in Discovery Blue
- Text: `font-size: 14px`, `line-height: 1.55`, `color: var(--fg2)`
- Button: outlined, `border: 1px solid var(--brand)`, `color: var(--brand)`, `border-radius: 8px`, hover fills with `var(--brand)` background and white text
- Footer timestamp: `font-size: 11px`, `color: var(--fg3)`, right-aligned

**Data source:** Existing assistant context/summary, can be driven by `useStudySummary()` and `useHdaDist()` to generate a text blurb.

### 4.6 Footer Ribbon

**Mockup:** A thin footer bar at the bottom:
- Left: "Data refreshed Jul 9, 2026, 08:30 AM ET" + refresh icon (🔄)
- Right: "Export dashboard" link with download icon (⬇)

**Current state:** The discovery landing has a dock/footer area.

**Changes needed:**
- Simple horizontal bar: `padding: 12px 32px`, `border-top: 1px solid rgba(51,102,255,0.08)`
- Left text: `font-size: 12px`, `color: var(--fg3)`
- Export button: `font-size: 13px`, `color: var(--brand)`, with download icon

---

## 5. Interactive & Motion Design Specifications

### 5.1 Micro-Animations

| Element | Animation |
|---|---|
| KPI numbers | Count-up animation on first paint (use existing `Counter` component from `web/src/components/warm/Counter.tsx`) |
| Donut chart segments | Staggered arc reveal: each segment animates from 0 to its final angle with `ease-out-cubic`, 400ms, 80ms stagger |
| Stacked bar chart | Bars grow from bottom, staggered left-to-right, 300ms each, `ease-out-cubic` |
| Nav active indicator | Blue underline slides to the active link position with `transform: translateX()`, 200ms, `ease-standard` |
| Card hover | `box-shadow` lifts from `0 1px 3px rgba(0,0,0,0.04)` to `0 8px 24px rgba(51,102,255,0.1)`, `180ms ease-standard` |
| Pipeline delta arrows | Gentle bounce-in animation on the `↑` arrows, `cubic-bezier(0.34, 1.56, 0.64, 1)`, 300ms |
| VPT progress bar | Width animates from 0% to 70% over 600ms on viewport intersection (use `IntersectionObserver`) |

### 5.2 Hover & Focus States

| Element | Hover | Focus-visible |
|---|---|---|
| Nav links | `color: var(--brand-800)`, underline slides in | Gold focus ring (`--shadow-focus-ring`) |
| KPI cards | Shadow lift, subtle border color intensify to `rgba(51,102,255,0.2)` | Gold focus ring |
| CTA button ("Ask the lab") | `background: var(--brand-800)`, scale `1.02` | Gold focus ring |
| Pipeline rows | `background: var(--bg-subtle)` transition | Row outline |
| Link arrows (→) | Translate `4px` right on hover, `120ms ease-sharp` | N/A |

### 5.3 Scroll Behavior

- **Sticky nav:** `position: sticky; top: 0; z-index: 110` with a subtle `backdrop-filter: blur(12px)` and white semi-transparent background
- **Scroll progress bar:** Thin `2px` bar at the very top of the viewport, fills Discovery Blue from left-to-right as user scrolls, tracks `document.scrollingElement.scrollTop / (scrollHeight - clientHeight)`
- **Smooth scroll:** Clicking nav links scrolls to corresponding section with `scroll-behavior: smooth` and a `112px` offset for the sticky nav

---

## 6. Visual Graphic Elements & Decorative Touches

### 6.1 Brand Pattern Background

The mockup uses a clean Cool White (`#F4F4F6`) background. To add subtle brand presence:
- Add a faint wordmark watermark (existing `wordmark-blue.png`) at `opacity: 0.04` positioned top-right, partially off-canvas — **already implemented** in `brand-esd.css` line 414–428
- Add a subtle radial gradient glow at the top-left corner: `radial-gradient(circle at 8% 8%, rgba(51,102,255,0.1), transparent 30%)` — **already implemented** in `brand-esd.css` line 406–410

### 6.2 Donut Chart Visual Details

- Ring thickness: `strokeWidth` of 28px on a 120px-diameter circle
- Gap between segments: `2px` visual gap (use `stroke-dashoffset` or `transform: rotate()` with small gaps)
- Center: empty (transparent center showing the card background)
- Legend dots: 8px circles with the phase color, positioned right of the chart

### 6.3 Icon Style

All icons use:
- Lucide React icon set (already installed: `lucide-react@^0.378.0`)
- `strokeWidth={1.5}` consistently
- `color="var(--brand)"` for primary actions
- `color="var(--fg3)"` for secondary/muted icons
- Size: 16px default, 14px in compact contexts, 20px in KPI card icon containers

### 6.4 Shadows & Elevation

| Level | Usage | Value |
|---|---|---|
| Level 0 | Default cards | `0 1px 3px rgba(0,0,0,0.04)` |
| Level 1 | Hovered cards | `0 8px 24px rgba(51,102,255,0.1)` |
| Level 2 | Nav bar, overlays | `0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(51,102,255,0.08)` (existing `--shadow-overlay`) |
| Focus | Focus-visible | `0 0 0 2px var(--bg-page), 0 0 0 4px #F4DA26` (existing `--shadow-focus-ring`) |

---

## 7. Responsive Breakpoints

| Breakpoint | Layout |
|---|---|
| `≥1280px` (desktop) | Full mockup layout — hero 55/45 split, 4-col KPI strip, 3-col analytics zone |
| `768–1279px` (tablet) | Hero stacks vertically, KPI strip becomes 2×2 grid, analytics zone: timeline full-width above, pipeline + assistant side-by-side below |
| `<768px` (mobile) | Everything single-column, nav links become horizontally scrollable pills, KPI cards stack 1-col, analytics cards stack |

---

## 8. Data Mapping (Hooks → Visual Elements)

All data comes from existing hooks in `web/src/api/hooks.ts`. No new API calls needed.

| Visual Element | Hook | Field(s) |
|---|---|---|
| Status ribbon enrollment | `useStudySummary()` | `enrolled`, `target` |
| Hero title/body | Static text (already in `Landing.tsx` constants) | N/A |
| Attention Pulse percentage | `useHdaDist()` | `sustained.pct` |
| Donut chart segments | `useHdaDist()` | All phase `.pct` values |
| VPT progress bar | `useHdaDist()` | VPT group sustained pct |
| KPI: Infants enrolled | `useStudySummary()` | `enrolled`, `target` |
| KPI: Median RMSSD | `useTrajectory("rmssd")` | Computed from series |
| KPI: Labeled epochs | `useStages()` | Sum of `done` across labeling stages |
| KPI: QA pass rate | `useStages()` | `qa.done / (qa.done + qa.fail)` |
| Attention Phase Timeline | `useHdaDist()` | Time-series phase distribution |
| Pipeline Watch table | `useStages()` | Stage name, done count, inflight |
| Assistant Insight text | `useStudySummary()` + `useHdaDist()` | Computed summary text |
| Footer timestamp | `useStudySummary()` | `lastUpdated` or `refreshedAt` |

---

## 9. Accessibility Requirements

- All interactive elements must have `aria-label` or visible text labels
- Donut chart must include `role="img"` with a descriptive `aria-label` listing all segment values
- Color should never be the sole indicator — pair chart colors with text labels/percentages
- Focus states use the gold focus ring (`--shadow-focus-ring`) for all interactive elements
- Pipeline Watch table should use semantic `<table>` markup with `<thead>` and `<tbody>`
- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text (>18px bold)
- KPI link actions should be keyboard-navigable (`tabindex`, proper `<a>` or `<button>` elements)

---

## 10. Verification Plan

After implementing, run these checks:

```bash
# 1. TypeScript compilation
cd web && npx tsc --noEmit

# 2. Unit tests
npm test -- --run

# 3. Full production build
npm run build

# 4. Visual verification
npm run dev
# Navigate to /discovery — should show the redesigned dashboard
# Navigate to /overview — should show the UNCHANGED garnet/serif dashboard
# Toggle theme to dark — discovery should have proper dark mode inversions
# Resize viewport to mobile — should stack cleanly
```

### Visual Checklist

- [ ] Sticky nav with logo, inline links, search, "Ask the lab" CTA
- [ ] Status ribbon shows live enrollment data
- [ ] Hero split: editorial text (left) + Attention Pulse card (right) with donut chart
- [ ] Four KPI cards in a horizontal strip with icons, numbers, labels, links
- [ ] Three-column zone: stacked bar chart, pipeline table, assistant card
- [ ] Footer ribbon with timestamp and export action
- [ ] All cards use `border-radius: 12px` with subtle blue-tinted borders
- [ ] Discovery Blue is the dominant accent — no warm tones leak through
- [ ] Dark mode inverts properly
- [ ] Mobile layout stacks all sections
- [ ] No regressions on `/overview` or other garnet routes
- [ ] Build succeeds with no errors

---

## 11. Implementation Order (Suggested)

1. **Tokens first:** Add new CSS custom properties to `brand-esd.css` (`--r-card-lg: 12px`, shadow levels, etc.)
2. **Nav refinement:** Restyle the sticky nav for the mockup's cleaner horizontal layout
3. **Hero split:** Restructure the hero section JSX + CSS into the two-column editorial/KPI layout
4. **Donut chart:** Create the `DonutChart` component (SVG-based, animated arc reveal)
5. **KPI strip:** Restyle the four metric cards with the new icon containers and link footers
6. **Analytics zone:** Build the three-column layout with stacked bar chart, pipeline table, assistant card
7. **Footer ribbon:** Add the data freshness timestamp and export button
8. **Micro-animations:** Add the count-up, bar-grow, donut-reveal, and hover transitions
9. **Dark mode:** Add `[data-theme="dark"]` overrides for all new tokens
10. **Mobile responsive:** Add `@media (max-width: 767px)` rules for all new layouts
11. **Accessibility pass:** Add aria-labels, semantic markup, keyboard navigation
12. **Verify:** Run build, tests, and visual checks

---

## 12. Key Insight: What to Preserve vs. What to Redesign

The discovery landing (`Landing.tsx`) is a **2,031-line component** with many sections. The redesign does NOT require rewriting the entire file. Instead:

- **Keep:** All data hooks, helper functions (`buildEcgStrip`, `buildDyad`, `pearson`, etc.), constants (`AIMS`, `ARCHITECTURE`, `READING_LIBRARY`, etc.), and the `NAV_SECTIONS` definition.
- **Restructure:** The JSX render tree in the `Landing` function component. The current layout has 11+ sections scrolling vertically. The mockup condenses the first viewport into: nav → status → hero → KPIs → analytics → footer. The remaining sections (Aims, Architecture, Pipeline, Cohort, Model, Studio, Assistant, Library) should still exist below the fold — they just aren't the first thing you see.
- **Restyle:** Apply new CSS module classes to the existing card containers, changing their shapes, shadows, borders, and spacing to match the mockup's aesthetic.

The goal is a **visual facelift of the existing content**, not a content rewrite.
