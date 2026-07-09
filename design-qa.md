# Discovery Design QA

## Scope

- Discovery landing: `http://127.0.0.1:5173/discovery`
- Discovery overview: `http://127.0.0.1:5173/discovery/overview`
- Discovery public insights: `http://127.0.0.1:5173/discovery/public-insights`

## Evidence

- Source visual truth: `/Users/namomac/.codex/generated_images/019f47cb-5298-7761-8811-40ca5b91f66a/exec-2f106456-0dfc-4c50-9b2e-cc0f414be98b.png`
- Browser-rendered implementation: `/tmp/esd-discovery-desktop-refined.png`
- Full-view comparison: `/tmp/esd-discovery-comparison-refined-retry.png`
- Desktop implementation viewport: 1440 x 1024.
- Mobile implementation viewport: 390 x 844 (`/tmp/esd-discovery-mobile-high-level.png`).

The source image is a fixed option board rather than a live page. It and the browser capture were placed together in a side-by-side comparison canvas at the desktop viewport before judging layout and visual density.

## Comparison History

**Finding: [P2] Hero headline was denser than the selected option.**

- Location: Discovery landing hero.
- Evidence: the first comparison showed a three-line headline in the implementation while Option 1 used a calmer two-line headline.
- Impact: the extra line increased above-the-fold density before the explanatory metric content.
- Fix: Discovery-scoped hero width increased from 13ch to 16ch and the desktop ceiling reduced from 58px to 52px.
- Post-fix evidence: `/tmp/esd-discovery-comparison-refined-retry.png` shows the implementation headline in two desktop lines, with the blue attention card aligned to the same visual level as the reference.

No actionable P0, P1, or P2 findings remain.

## Fidelity Review

- Fonts and typography: bold sans headline hierarchy is retained, with zero negative tracking in the Discovery override. The final desktop heading is two lines; mobile wraps cleanly without clipping.
- Spacing and layout rhythm: the flat white header, cool-blue study band, split hero, compact study summary, and four KPI cards preserve a clear scan order. Desktop and mobile checks found no horizontal overflow.
- Colors and visual tokens: the Discovery-only surface uses white, cool-blue, official discovery blue, and black ink. Data cards use flat fills, restrained borders, and no decorative gradients or shadows.
- Image quality and asset fidelity: the official Discovery Blue wordmark, sunburst, and star were rasterized from the supplied ESD Lab source artwork. No handmade SVG, CSS artwork, placeholder image, or text substitute is used for those visible assets.
- Copy and content: the KPI row gives a one-sentence meaning for each value, while the metric guide defines RMSSD, HDA, and QA pass rate in plain language. The expanded routes remain accessible through the compact More menu rather than crowding the header.

## Responsive and Interaction Checks

- `/discovery`, `/discovery/overview`, and `/discovery/public-insights` rendered at 390 x 844 with no horizontal overflow.
- The Discovery More menu expanded and collapsed correctly during interaction verification.
- `Ask ESD Buddy to explain a metric` opened the existing assistant drawer.
- Browser console error check on Discovery returned no errors.
- Main-site isolation verified: `/` and `/overview` have no Discovery layout marker and no Discovery-only logo asset.

## Automated Verification

- `npm run lint`
- `npm test -- --reporter=dot` - 30 files, 122 tests passed.
- `npm run build`
- `bash -n scripts/share_dashboard.sh`
- `git diff --check`
- `make compose-validate`
- `make docker-health`
- `make ops-check`
- `make pages-deploy` - deployed to the production Pages branch; canonical and runtime surfaces are healthy.

## Residual Risk

- The public API origin is a current quick-tunnel host. The repaired share check now uses DNS-over-HTTPS only when local DNS temporarily cannot resolve that host; the named-tunnel migration remains a separate infrastructure decision.

final result: passed
