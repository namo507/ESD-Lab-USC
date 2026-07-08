# ESD UI Design — "Discovery" Brand Skin (Additive, Non-Destructive)

> A build-ready design prompt for adding a **new, separately themed section** to the existing ESD Lab dashboards, styled to the official *Early Social Development Lab* brand (Discovery Blue + Libre Franklin + sunburst motifs). This is a **parallel skin used for testing**. It must **not override, replace, or restyle the current garnet/serif dashboards**. The existing design stays the default and stays byte-for-byte intact.

---

## 0. Read this first (intent in one paragraph)

I want you to build a second, brand-accurate visual treatment of the dashboard and mount it as an **additive section** alongside the current one. The live product today (`https://esd-lab-namo.pages.dev/` and `/overview`) is a warm, off-white, USC-garnet, Source-Serif editorial system. Keep every pixel of that. On top of it, add a **Discovery Blue** skin that reproduces the same screens and the same features, restyled to the lab brand guidelines. A viewer should be able to flip into the new look, see all existing functionality faithfully re-skinned, and flip back to the untouched original. Nothing about the current tokens, routes, or components changes in a way that alters their present appearance or behavior.

---

## 1. Objective

Create a **feature-flagged, scope-isolated "ESD Discovery" theme** and a **parallel route surface** that render the existing dashboard features using the official ESD Lab brand system, while leaving the current garnet/serif design as the untouched default.

**Success in one sentence:** the reviewer toggles the new skin on, navigates every existing feature in Discovery-Blue Libre-Franklin styling with full parity, toggles it off, and the app is visually and behaviorally identical to today.

---

## 2. Inputs (ground truth — verified against the repo and brand files)

### 2.1 Current system (the baseline to preserve)

| Aspect | Fact |
|---|---|
| Repo | `github.com/namo507/ESD-Lab-USC`, frontend in `web/` |
| Stack | Vite + React + React Router + TanStack Query + Zustand + Tailwind |
| Design tokens | `web/src/styles/tokens.css` (USC garnet `#73000a`, gold `#ffcc00`; fonts Source Serif 4 / Source Sans 3 / JetBrains Mono) |
| Warm palette + theming | `web/src/styles/global.css` (`--warm-*`, `--vpt-*`, `--mint-*`); dark mode via `:root[data-theme="dark"]` |
| Theme store | `web/src/store/ui.ts` → `applyTheme` / `persistTheme`, writes `data-theme` on `<html>` |
| Tailwind map | `web/tailwind.config.ts` (maps CSS vars to `garnet`, `gold`, `sage`, `ocean`, `sand`, `mint`, type scale, radii, shadows, keyframes) |
| Routes | `web/src/App.tsx` — 55+ lazy routes; page components in `web/src/routes/` |
| Shell / nav | `web/src/components/shell/` → `AppShell.tsx`, `Sidebar.tsx` (`NAV_GROUPS`), `TopNav.tsx`, `ThemeToggle.tsx`, `Buddy.tsx`, `HipaaBanner.tsx` |
| Feature flags | `web/src/config/featureFlags.ts` → `FEATURE_FLAGS` map + `FEATURE_FLAG_RELEASE_DATES` |
| Sibling prompts | `design-ideas/` (this file lives here) |

**Current visual identity (must remain the default, do not alter):**
Warm off-white page (`#fafaf8`), USC garnet primary (`#73000a`) with gold (`#ffcc00`), **serif** display/H1 (Source Serif 4) with garnet accent words, Source Sans body, 2px default radius, single soft elevation, tabular numerals, 240px warm sidebar with a garnet active bar, HIPAA banner, ESD Buddy (Cmd/Ctrl+K), Force Sync, light/dark/system theme toggle.

### 2.2 The ESD Lab brand system (source of the new look)

Extracted from `ESD Lab Brand Files/10. guidelines/Brand Guidelines.pdf` and the logo/pattern/font folders. **Do not modify anything in `ESD Lab Brand Files/`; it is read-only reference.**

**Primary palette (this is the signature; lead with Discovery Blue):**

| Name | HEX | Role |
|---|---|---|
| Discovery Blue | `#3366FF` | Signature. Expertise, dependability, scientific pursuit. Primary actions, active states, brand fills. |
| Science Blue | `#91BAF4` | Secondary blue, supporting fills, hover, charts. |
| Cool Blue | `#E6EEFC` | Tint surface / subtle card / selected background. |
| Cool White | `#F4F4F6` | Page / neutral surface. |
| Jet Black | `#000000` | Text, high-contrast type. |

**Secondary palette (use sparingly, always paired with a primary color, never on their own):**

| Name | HEX |
|---|---|
| Confident Orange | `#F57F00` |
| Firetruck Red | `#D74E2D` |
| Optimal Yellow | `#F4DA26` |
| Baby Pink | `#F8B2B1` |

> Rule from the guidelines: *"The secondary colors should be used sparingly and with purpose... Don't use the secondary colors by themselves,"* and *"make sure colors have a strong contrast when using them."* Encode both rules (see §6 and §8).

**Typography — Libre Franklin** (Bold for headings, Medium for body/paragraph). Free on Google Fonts; local `.ttf` also in `ESD Lab Brand Files/9. fonts/` (`librefranklin-bold.ttf`, `librefranklin-medium.ttf`, plus italics).

Brand type scale (guideline values are print points; treat the **ratios, weights, and tracking** as the spec and map to a responsive web scale — see §5.2):

| Token | Font | Size (guideline) | Line | Tracking |
|---|---|---|---|---|
| H1 | Libre Franklin Bold | 58 | 1.0 | tight (guideline -5) |
| H2 | Libre Franklin Bold | 38 | 1.1 | tight (-10) |
| H3 | Libre Franklin Bold | 28 | 1.1 | tight (-10) |
| H4 | Libre Franklin Bold | 24 | 1.2 | tight (-10) |
| H5 | Libre Franklin Bold | 16 | 1.2 | tight (-10) |
| Paragraph / Body | Libre Franklin Medium | 12 | 1.2 | tight (-10) |
| Small | Libre Franklin Medium | 10 | 1.2 | tight (-10) |

> Interpretation note: the guideline tracking values (-5, -10) are in the design tool's 1/1000-em units, so H1 ≈ `-0.005em` and the rest ≈ `-0.01em`. Keep headings tight and bold; keep body legible (see §5.2 for the web mapping I want).

**Signature shapes and motifs (from "Shapes, Icons and Patterns" + "Our Look"):**
- **Sunburst** (soft pixelated radial burst) — use when signaling "the amazing things the lab is doing." Hero/loading/celebration accents.
- **Star / asterisk-flower** (solid Discovery Blue, sometimes Optimal Yellow) — associates the lab's offerings/studies; frequently overlaps a **circular-cropped infant photo**.
- **Institute for Mind & Brain glyph** — use when referencing physical location / IMB.
- **Brain-duck line pattern** (white doodle line-art on a blue field) — decorative section fills and empty states.
- **Doodle icon set** (baby, brain, brain-circuit, ear, eye, hand/hands, ECG, blocks, pacifier, clipboard, graph, speech bubbles, glasses, feet, duck) in Science Blue / Cool Blue / Cool White.

**"Our Look" summary:** bold Discovery-Blue fills, white line-art motifs, oversized bold headlines (blue on light, or white on blue), circular cropped infant photography, a blue star/sunburst breaking the photo edge, generous whitespace, and only high-contrast color pairings.

**Logos:** use the 2026 wordmark set in `ESD Lab Brand Files/1. logos/ESD Lab at USC Logos (2026)/` (horizontal / vertical / wordmark / social) plus the sunburst mark. Keep clear-space and never recolor or distort per the guideline "Common mistakes" page.

---

## 3. Hard constraints (non-negotiable, this is the whole point)

1. **Do not edit existing values** in `tokens.css`, `global.css`, or `tailwind.config.ts` in any way that changes how current screens render. Additive-only. If you must touch a shared file, you may only **append** new, namespaced declarations that are inert unless the new scope is active.
2. **Do not restyle, move, or delete** any existing route, component, or nav entry. The garnet design remains the default with zero visual diff.
3. The new look is delivered as **(a) a scoped theme** (CSS variable overrides that apply only under an explicit scope attribute/class) and **(b) an additive surface** (either a new route subtree or a new nav group), gated by **one new feature flag**.
4. **Feature parity:** every feature reachable today is reachable and functional in the new skin (see §7). No feature is brand-exclusive and none is dropped.
5. **Reversibility:** turning the new flag off returns the app to exactly today's state (same DOM classes, same theme, no orphan styles loading).
6. **Brand fidelity:** colors, fonts, spacing, radii, and motifs match the brand files. Discovery Blue leads; secondary colors appear only in support of a primary and never alone.
7. **No new heavy dependencies** for theming. Reuse the existing token/Tailwind pattern. Fonts load via Google Fonts (with local `.ttf` fallback available in brand files).
8. **Accessibility:** all text/!UI meets WCAG AA contrast in both the light and dark variants of the new skin (see §6, §8).

---

## 4. Integration mechanism (how to mount it without touching the default)

Pick the approach that fits the codebase; **Option A is preferred**.

### Option A — Scoped brand theme + additive nav group (recommended)

1. **New stylesheet** `web/src/styles/brand-esd.css` that defines the Discovery tokens **only under a scope**, e.g. `[data-brand="esd-2026"] { ... }` (and a dark companion `[data-brand="esd-2026"][data-theme="dark"] { ... }`). It overrides the *same variable names* the components already consume (`--bg-page`, `--fg1`, `--usc-garnet` role usages, `--warm-*`, `--font-serif`, `--font-sans`, radii, shadows) **within the scope only**. Import it once in the app entry; because every rule is scoped, it is inert until the attribute is set.
2. **Scope application:** set `data-brand="esd-2026"` on the shell wrapper of the new surface (or on `<html>` while the toggle is on). When absent, the app is 100% the current design.
3. **New feature flag** in `web/src/config/featureFlags.ts` (append; do not reorder existing keys): `BRAND_ESD_2026: true` (default on for testing) and an optional `FEATURE_FLAG_RELEASE_DATES.BRAND_ESD_2026`.
4. **Additive nav group** in `Sidebar.tsx` `NAV_GROUPS` (append a new group object, e.g. `{ id: "brand", title: "Brand Preview · 2026", items: [...] }`) whose items point at the themed surface, each guarded by the new flag. Do not modify existing groups.
5. **Toggle:** extend the existing `ThemeToggle` (or add a sibling "Skin" switch) offering `Default` vs `Discovery (2026)`. Persist via the existing `store/ui.ts` pattern (add a `brand` field; do not change `theme`).

### Option B — Parallel route subtree

Mount a new subtree such as `/discovery/*` that wraps the existing page components in a `data-brand="esd-2026"` shell. Reuse the same data hooks and route components; only the shell and theme differ. Keep all current top-level routes unchanged.

> Either way: **reuse the existing feature components and data layer.** This is a re-skin, not a re-implementation. Do not fork business logic.

---

## 5. Design tokens for the new skin (author these)

### 5.1 Color tokens (scoped)

Map the brand palette onto the roles the components already use, so re-skinning is mostly variable overrides:

```
[data-brand="esd-2026"] {
  /* surfaces */
  --bg-page:      #F4F4F6;   /* cool white */
  --bg-surface:   #FFFFFF;
  --bg-subtle:    #E6EEFC;   /* cool blue tint */
  --bg-hover:     #E6EEFC;
  --warm-bg:      #F4F4F6;   /* neutralize the warm layer within scope */
  --warm-card:    #FFFFFF;
  --warm-border:  #E1E8F5;
  --warm-pill:    #E6EEFC;

  /* brand primary (remap garnet role usages to Discovery Blue) */
  --brand:        #3366FF;   /* discovery blue */
  --brand-600:    #2450E6;   /* hover (derive, verify contrast) */
  --brand-800:    #1B3DBF;   /* press */
  --usc-garnet:   #3366FF;   /* role remap so existing garnet references read as brand blue IN SCOPE ONLY */
  --usc-gold:     #F4DA26;   /* optimal yellow, accent only */
  --vpt-bg:       #E6EEFC; --vpt-fg: #1B3DBF;

  /* foreground */
  --fg1: #0A0A0A; --fg2: #22303F; --fg3: #55606B; --fg-link: #3366FF;

  /* semantic (keep meaning, shift to brand-consistent hues) */
  --blue: #3366FF; --green: #2FA36B; --red: #D74E2D; --purple: #8172B2;

  /* secondary accents — expose but use sparingly, never alone (see §6) */
  --accent-orange: #F57F00;
  --accent-red:    #D74E2D;
  --accent-yellow: #F4DA26;
  --accent-pink:   #F8B2B1;

  /* type + shape */
  --font-serif: 'Libre Franklin', 'Source Serif 4', system-ui, sans-serif; /* headings become Libre Franklin */
  --font-sans:  'Libre Franklin', 'Source Sans 3', system-ui, sans-serif;
  --r-2: 6px;  /* brand look is a touch rounder; keep subtle. Verify against motifs. */
}
```

> Derived values (`--brand-600/800`, borders) are my suggestions; **verify each against AA contrast and adjust**. Do not invent brand hexes beyond the palette for anything load-bearing; secondary accents stay decorative.

### 5.2 Typography (scoped) — web mapping I want

Load Libre Franklin (weights 500 + 700, plus italics). Then set, **in scope only**:

- Headings switch from serif to **Libre Franklin Bold**, tight tracking, e.g. H1 `clamp(40px, 4.5vw, 56px)` / line-height ~1.02 / `letter-spacing: -0.01em`; H2 `32px/1.1/-0.01em`; H3 `24px/1.12`; H4 `20px/1.2`; H5 `16px/1.2`.
- Body / paragraph: **Libre Franklin Medium**, but **do not ship 12px body on the web** — the guideline 12/10 sizes are print. Keep the current comfortable web body (~15px) for readability and AA, just in Libre Franklin Medium with slightly tight tracking (`-0.006em`). Preserve tabular numerals for metrics.
- Keep the existing type-scale variable names so components inherit automatically.

### 5.3 Motif + component assets

- Add brand SVGs/PNGs to `web/src/assets/brand-esd/` (sunburst, star/asterisk-flower, IMB glyph, brain-duck pattern tile, doodle icon set). Source them from `ESD Lab Brand Files/` (copy, do not link the OneDrive path).
- Provide a small `<BrandMark variant="sunburst|star|imb" />` and a `<DoodlePattern />` background component for hero/empty-state use.

---

## 6. Component re-skin map (parity, one row per surface element)

Restyle these **in scope** so every screen reads as the brand while keeping structure/behavior identical:

| Element | Today (keep as default) | Discovery skin (in scope) |
|---|---|---|
| Page background | Warm off-white | Cool White `#F4F4F6`, optional cool-blue section bands |
| Display / H1 | Source Serif, garnet accent word | Libre Franklin Bold, Discovery-Blue accent word, tight tracking |
| Primary button / CTA | Garnet fill | Discovery Blue fill, white text (`Force Sync`, `Ask the lab`, etc.) |
| Active nav item | Garnet text + left bar | Discovery Blue text + blue left bar; active bg cool-blue |
| Sidebar brand chip ("e") | Garnet gradient tile | Discovery-Blue tile or sunburst mark |
| Cards | White, warm border, 2px, soft shadow | White, cool-blue border, ~6px, same single elevation |
| Badges / pills | Warm neutrals + garnet | Cool-blue pills; status keeps semantic colors |
| Links | Garnet underline-on-hover | Discovery-Blue, same interaction |
| Charts | Garnet/gold/sage/ocean series | Discovery/Science Blue-led series; secondary accents only as needed, never a chart built solely from secondaries |
| Hero / empty states | Warm editorial | Blue fields with white brain-duck doodles; sunburst/star accents; circular infant photos with star breaking the edge |
| HIPAA banner | Warm caution | Same content and behavior; brand-neutral styling, AA contrast |
| Loading / skeleton | Current | Optional subtle sunburst spinner (reuse existing keyframes) |
| Dark mode | Warm dark tokens | Brand dark: deep blue-charcoal surfaces, Discovery Blue lifted for contrast |

**Secondary-color guardrail:** orange/yellow/red/pink may appear as small accents, program tags, or a single highlighted stat, always alongside a primary. Add a lint note / code comment forbidding a secondary as a standalone background for primary content, and forbidding low-contrast pairs (e.g., yellow text on yellow) per the guideline "avoid poor contrast" page.

---

## 7. Feature parity checklist (all must work in the new skin)

Re-skin, do not remove. Source of truth is `Sidebar.tsx` `NAV_GROUPS` and `App.tsx` routes.

- **Lab Operations:** Overview (`/overview`), Intakes & Stories (`/participants`), Window QA (`/qa`), Documentation (`/docs`), Help / Tour (`/how-to`).
- **Active Studies:** NANO Study VPT (`/overview`), Home Study, FiSCAL-ASD (`/participants?study=…`).
- **NANO · NICO:** LGCM Trajectories (`/nano/lgcm-trajectories`), Aim 3 Clusters (`/nico/aim3-clusters`).
- **Data Infrastructure:** Clinical Pipeline (`/runs`), REDCap Sync (`/redcap`), Pipeline Health (`/pipeline-health`), MATLAB Bridge (`/matlab`), Data Explorer (`/data-explorer`), Results & Trajectories (`/results`), HDA Timeline (`/hda-player`), Thermal Heatmap, Swimmer Plot, Attrition, ECG Quality, SDOH Map, SHAP Explorer, Outcome Clusters, Model Leaderboard, Cascade DAG.
- **Science:** Publications (`/publications`, `/publications/:pmid`).
- **Insights & Demos:** Guided Explorer, Public Insights, CGA River, County Compare, Participant Timeline, Model Terrain, Attrition Funnel, Executive Mode.
- **Dynamics & Dyads:** Co-Regulation, Multimodal Sync, Phase Portrait, CVA Theater, HR Deceleration, Still-Face, HDA Bypass, Passport, Archetypes, Cascade Sim, Eco-Validity, Stream Coverage.
- **Lab Tools:** Presentation Maker, Spatial Matrix, Attachment Heatmap.
- **Admin:** Change History.
- **Cross-cutting:** ESD Buddy (Cmd/Ctrl+K), Force Sync, StudySelector, HIPAA banner, light/dark/system theme, participant detail (`/participants/:id`), QA detail (`/qa/:id`), Landing (`/`), Executive Mode nav variant.

Feature flags stay authoritative: a feature hidden by its existing flag stays hidden in the new skin too (do not force-enable).

---

## 8. Success criteria (measurable, verify each)

1. **Zero-diff default:** with `BRAND_ESD_2026` off (and the skin toggle at Default), a visual/DOM comparison of `/` and `/overview` against current `main` shows no change.
2. **Scoped isolation:** removing `data-brand="esd-2026"` from the DOM instantly restores the default look on the same page; no brand CSS applies out of scope.
3. **Brand fidelity:** headings render in Libre Franklin Bold; primary actions and active states are Discovery Blue `#3366FF`; surfaces are cool white/cool blue; sunburst/star/doodle motifs present on hero/empty states.
4. **Parity:** every §7 item loads and functions in the new skin, matching the default's behavior and data.
5. **Contrast:** automated check (axe / Lighthouse) passes AA for text and UI in both light and dark brand variants; no secondary-on-secondary low-contrast pairs.
6. **Secondary discipline:** no screen uses a secondary color as the sole primary surface or as a standalone element.
7. **Reversibility:** flag off ⇒ new nav group hidden, brand stylesheet inert, no console errors, no network fetch of brand fonts/assets on default screens (or negligible/lazy).
8. **No regressions:** existing unit tests (incl. `sidebarNav.test.tsx`, `routeErrorBoundary.test.tsx`) pass; add tests for the flag-gated nav group and the scope toggle.

---

## 9. Output / deliverables

1. `web/src/styles/brand-esd.css` — scoped Discovery tokens (light + dark).
2. Font loading for Libre Franklin (index `<link>` or CSS `@import`, weights 500/700 + italics), with `.ttf` fallback wired from copied brand assets.
3. `web/src/assets/brand-esd/` — sunburst, star, IMB glyph, brain-duck pattern, doodle icon set (copied from brand files) + `BrandMark` / `DoodlePattern` components.
4. `web/src/config/featureFlags.ts` — appended `BRAND_ESD_2026` (+ optional release date).
5. `Sidebar.tsx` — appended `NAV_GROUPS` "Brand Preview · 2026" group (flag-gated); no edits to existing groups.
6. Skin toggle (extend `ThemeToggle` or add sibling) + `store/ui.ts` `brand` field (additive).
7. Option-A scope wiring (or Option-B `/discovery/*` subtree) reusing existing page components.
8. Tests for flag gating + scope toggle; brief `design-ideas/` note or `web/README.md` addendum documenting how to enable/disable.
9. Screenshots (light + dark) of Overview and Landing in the new skin for review.

---

## 10. Edge cases and fallbacks

- **Libre Franklin fails to load** ⇒ fall back to Source Sans 3 / system-ui; layout must not shift materially (set `font-display: swap`, matched metrics where possible).
- **Dark mode in new skin** ⇒ author explicit `[data-brand="esd-2026"][data-theme="dark"]` overrides; do not rely on the warm dark tokens. Lift Discovery Blue for contrast on dark surfaces.
- **Secondary-color misuse** ⇒ if a component needs a standalone strong accent, use Discovery Blue, not a secondary. Secondary only garnishes.
- **Existing garnet references in component code** (e.g., `text-garnet`, `bg-garnet`, inline `var(--usc-garnet)`) ⇒ these read as Discovery Blue **in scope** because of the role remap. A repo audit found **0 hardcoded `#73000a`/`#ffcc00` literals** in `components/` and `routes/`, so everything already flows through CSS variables and the scoped override recolors cleanly. Still run a quick grep before shipping to catch any new literals.
- **Charts with fixed hex series** ⇒ provide a scoped palette array (Discovery/Science Blue-led) selected when the brand scope is active; keep the default palette otherwise.
- **Print/PDF exports** (Presentation Maker, poster/flyer templates) ⇒ if they should follow the brand, use the brand type scale's print sizes (H1 58, body 12) there; on-screen keeps the web scale from §5.2.
- **Flag off mid-session** ⇒ toggling must not require reload; scope attribute removal is enough.

---

## 11. Reusable variables (so this prompt can be re-run for other skins)

- `{brand_scope}` = `data-brand="esd-2026"` (attribute/selector the theme keys off).
- `{flag_name}` = `BRAND_ESD_2026`.
- `{primary}` = `#3366FF`; `{primary_tint}` = `#E6EEFC`; `{surface}` = `#F4F4F6`.
- `{heading_font}` = `Libre Franklin` @700; `{body_font}` = `Libre Franklin` @500.
- `{secondary_set}` = `{#F57F00, #D74E2D, #F4DA26, #F8B2B1}` (garnish only).
- `{nav_group_title}` = `Brand Preview · 2026`.
- `{mount_mode}` = `A` (scoped theme + nav group) or `B` (`/discovery/*` subtree).

---

## 12. Definition of done

The current garnet/serif dashboards are untouched and remain the default. A single feature flag reveals a Discovery-Blue, Libre-Franklin, sunburst-accented skin that re-renders every existing feature at full parity, passes AA contrast in light and dark, respects the secondary-color discipline, and disappears cleanly when the flag is off, with tests and review screenshots proving both states.
