# Discovery Dashboard Design QA

## Comparison target

- Source visual truth path: `/Users/namomac/ESD-Lab-USC/design-ideas/discovery-dashboard-redesign-prompt.md`
- Existing source capture used to verify the intended overhaul: `/Users/namomac/ESD-Lab-USC/design-ideas/discovery-brand-audit/local-discovery-desktop.png`
- Browser-rendered implementation screenshot: `/Users/namomac/ESD-Lab-USC/design-qa/local-discovery-redesign-desktop.jpg`
- Dark-mode evidence: `/Users/namomac/ESD-Lab-USC/design-qa/local-discovery-redesign-dark.jpg`
- Mobile evidence: `/Users/namomac/ESD-Lab-USC/design-qa/local-discovery-redesign-mobile.png`
- Desktop viewport and state: 1430 × 993, `/discovery`, light theme, All infants, 0–12m, mock API data settled after animations.
- Mobile viewport and state: 390 × 844, `/discovery`, light theme, top of page.

The repository does not contain the separate mockup image referenced by the prompt. The detailed written prompt is therefore the target specification; the existing desktop capture is the before-state used to verify that the requested hierarchy and styling changed without affecting the default landing.

## Full-view comparison evidence

The before-state capture and the final 1440 × 1000 browser capture were opened together in the same comparison input. The final implementation replaces the oversized three-column narrative hero, attention rail, study card, ECG ribbon, and floating dock with the requested full-width navigation, status ribbon, editorial/Attention Pulse split, four-card KPI strip, three-panel analytics zone, and freshness/export footer. The remaining sections continue below the redesigned opening.

Focused region comparison was not required because the target is a written specification rather than a pixel-matched image, and the original-resolution desktop capture keeps every specified opening region legible. Smaller control and copy details were also verified against the live browser DOM, accessible names, computed styles, and component bounds.

## Findings

No actionable P0, P1, or P2 differences remain.

### Required fidelity surfaces

- Fonts and typography: Libre Franklin is loaded from the bundled brand files. Headings use 700, body copy uses 500, the hero resolves to 48px at 1440px, and section labels use tracked 11px uppercase styling. Wrapping and truncation were checked at desktop and 390px.
- Spacing and layout rhythm: the navigation is square/full-width, cards use 12px radii, desktop hero uses the intended two-column split, KPIs use four equal tracks, analytics use a 2fr/1fr/1fr layout, tablet falls to 2×2 KPIs, and mobile stacks every card in one column. Browser geometry reported no horizontal overflow at 1440px or 390px.
- Colors and visual tokens: Cool White and pure-white surfaces lead the light theme; Discovery Blue is dominant; Science Blue, Confident Orange, Deep Blue, and Optimal Yellow are limited to their specified chart roles. The dark counterpart uses navy surfaces and Science Blue link/active states with readable contrast.
- Image quality and asset fidelity: the existing branded ESD mark and bundled wordmark/pattern assets are retained. Standard controls use the installed Lucide icon set. The Attention Pulse visualization is a semantic SVG data chart, not a placeholder or decorative approximation.
- Copy and content: enrollment and RMSSD come from their existing hooks; the labeled-window KPI comes from the HDA distribution; the QA KPI is calculated from the Window QA stage only; pipeline columns distinguish completed and in-flight records. The corrected-age chart consumes the existing `useHdaComposition()` series without synthetic date modifiers, while freshness copy uses the latest run timestamp returned by `useRuns()`.
- Accessibility and interaction: the donut exposes a descriptive `role="img"` label, every corrected-age bar has a phase-by-phase accessible label, the pipeline uses semantic table markup, visible controls are keyboard elements, focus rings use the gold brand token, and reduced-motion fallbacks disable reveal animations. Search, smooth-scroll navigation, 0–3m/0–12m/All filtering, cohort selection, assistant open/close, theme cycling, and CSV export are wired.

## Browser verification

- Primary interactions tested: nav scroll, dashboard search and Enter-to-library behavior, cohort select, corrected-age segmented control, assistant follow-up open/close, and theme cycle. The 0–3m control reduced the API-backed chart from seven to four age points and the VPT filter updated the accessible bar values.
- Responsive checks: 1440 × 1000 desktop and CDP-backed 390 × 844 mobile emulation.
- Regression check: `/` retained the original warm landing structure; non-discovery routes continue using the existing shell.
- Console errors checked: none. Only pre-existing React Router future-flag warnings were present.

## Comparison history

1. Initial pass found a P2 dark-mode contrast issue: the active navigation and blue text links used Discovery Blue against the navy page. Fix: dark-mode active/link states now use Science Blue (`--fg-link`). Post-fix evidence: `local-discovery-redesign-dark.jpg`.
2. Initial pass found a P2 typography drift: the desktop hero resolved to 54px instead of the brand display ceiling. Fix: the desktop hero now resolves to 48px with a 1.06 line height and wider measure. Post-fix evidence: `local-discovery-redesign-desktop.jpg`.
3. Final review found P2 data-integrity drift: the date controls relabeled a synthetic series, the pipeline delta column actually displayed in-flight work, aggregate stage totals were mislabeled as HDA and QA metrics, and freshness was hard-coded. Fix: the chart now uses `useHdaComposition()` corrected-age data, the table accurately labels completed and in-flight counts, HDA and Window QA KPIs use their specific sources, and freshness/export dates are derived at runtime.
4. Final pass found no remaining P0/P1/P2 issues. Mobile bounds, card stacking, dark contrast, source labels, visual tokens, and interaction states passed.

## Follow-up polish

- P3: the specific standalone sunburst PNG files referenced by the prompt are empty in the repository, so the existing bundled ESD brand mark is preserved instead of introducing an unverified replacement.
- P3: historical stage deltas are not exposed by the current API contract, so the compact table reports the available in-flight count explicitly instead of implying a historical comparison.

## Implementation checklist

- [x] Sticky horizontal navigation, search, CTA, and de-emphasized display controls
- [x] Status ribbon with enrollment, date, and study detail action
- [x] Editorial hero plus accessible animated donut and VPT progress
- [x] Four animated KPI cards
- [x] API-backed corrected-age attention chart, semantic pipeline table, and assistant insight
- [x] Freshness and CSV export footer
- [x] Dark mode, reduced motion, and 390px mobile stacking
- [x] Original warm landing and operator routes preserved

final result: passed
