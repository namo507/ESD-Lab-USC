# Discovery Design QA

## Scope

- Production landing: `https://esd-lab-namo.pages.dev/discovery`
- Production overview: `https://esd-lab-namo.pages.dev/discovery/overview`
- Production public insights: `https://esd-lab-namo.pages.dev/discovery/public-insights`
- Main-site isolation: `/` and `/overview` remain visually and behaviorally unchanged.

## Evidence

- Selected visual source: `/Users/namomac/.codex/attachments/f8b1588e-7df9-44dc-86c1-875495aadc42/image-1.png`
- Browser-rendered desktop implementation: `/tmp/esd-discovery-exact-viewport-final.png`
- Source and implementation comparison: `/tmp/esd-discovery-side-by-side-final.png`
- Browser-rendered mobile implementation: `/tmp/esd-discovery-mobile-final.png`
- Desktop comparison viewport: 1487 x 1058, matching the source image.
- Mobile verification viewport: 390 x 844.

The source and browser render were combined into one side-by-side image before the final fidelity review. The live production route was then checked separately for the shipped controls, content, and responsive layout.

## Comparison History

**Finding: [P2] The analytics trio sat below the first viewport and repeated a study-summary strip.**

- Fix: compressed Discovery-only hero spacing, removed the redundant strip, and brought the live attention timeline, pipeline watch, and assistant insight into the first viewport.

**Finding: [P2] System dark mode changed the selected option's light header and title treatment.**

- Fix: added Discovery-scoped light rendering while leaving the main website's theme behavior intact.

**Finding: [P2] The mobile attention explanation was squeezed into a narrow column.**

- Fix: changed the mobile attention overview to a single-column layout so its notation and summary remain readable.

**Finding: [P1] The canonical worker still referenced an expired quick-tunnel origin after the container rebuild.**

- Fix: repaired the macOS cloudflared bootstrap, kept continuous supervision alive while Pages converges, and installed a launchd supervisor that republishes a healthy origin automatically.

No actionable P0, P1, or P2 findings remain.

## Fidelity Review

- Typography and hierarchy: the split headline, concise study description, compact attention card, four KPI strip, and three-column workbench match the selected option's scan order without crowding the page.
- Shapes and symbols: the official Discovery wordmark, star, sunburst, and four source metric icons are integrated at meaningful points. The phase donut and stacked timeline use real aggregate data rather than decorative placeholders.
- Metric clarity: each KPI includes one short meaning statement; the separate guide defines RMSSD, HDA, and QA pass rate in plain language. Detail is revealed contextually through chart selection and the existing assistant.
- Motion: stacked bars reveal progressively, live status pulses, and the source sunburst breathes subtly. All motion is disabled under `prefers-reduced-motion`.
- Density and alignment: panels use a flat, symmetrical grid with 8px radii, stable control dimensions, and no nested cards. Desktop and mobile checks found no clipping or horizontal overflow.
- Route isolation: the redesign is scoped to `/discovery/*`; `/` retains its original actions and study summary, and `/overview` has no Discovery layout marker or workbench.

## Responsive and Interaction Checks

- `/discovery`, `/discovery/overview`, and `/discovery/public-insights` render without horizontal overflow.
- Cohort and corrected-age controls update the live attention timeline; selecting VPT, 0-3m, and month 3 produces four visible bars and a matching plain-language insight.
- `Ask a follow-up` opens ESD Buddy with the selected metric context, and the local model returned a response.
- `Full attention analytics` navigates to `/discovery/results`; pipeline and compact navigation actions remain functional.
- Browser console contains no errors. Only the existing React Router future-option warnings remain.

## Automated Verification

- `npm run lint`
- `npm test -- --reporter=dot` - 30 files, 122 tests passed.
- `npm run build`
- `bash -n scripts/share_dashboard.sh`
- `git diff --check`
- `make compose-validate`
- `make docker-health` - dashboard and autoheal healthy.
- `make ops-check` - nine canonical and runtime surfaces healthy, including assistant readiness and API-origin parity.
- Canonical Cloudflare Pages deploy stamp: `2026-07-10T02:17:33Z`.
- Continuous share supervisor: `com.esdlab.dashboard-share-supervisor`, active and republishing automatically.

## Residual Risk

- The public API currently uses a supervised quick-tunnel origin. The supervisor self-heals and republishes it, but a named Cloudflare Tunnel would be the durable infrastructure follow-up.

final result: passed
