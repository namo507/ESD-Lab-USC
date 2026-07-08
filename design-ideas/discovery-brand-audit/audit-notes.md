# Discovery Brand Audit

Date: July 8, 2026

## Source Brief

- `design-ideas/ESD UI design.md`
- `ESD Lab Brand Files/10. guidelines/Brand Guidelines.pdf`

## Live Baseline Captures

- `live-discovery-desktop.png`
- `live-discovery-mobile.png`
- `live-overview-desktop.png`
- `live-overview-mobile.png`

Key findings:

- The deployed Discovery landing still read warm/editorial instead of cool-white and Discovery-blue led.
- The deployed mobile landing nav/dock collided with the first viewport; the fixed dock covered hero text.
- The overview structure was stable, but brand motifs were too faint and preliminary finding cards used amber as a standalone surface.

## Local Verification Captures

- `local-discovery-desktop.png`
- `local-discovery-mobile.png`
- `local-overview-desktop.png`
- `local-overview-mobile.png`

Local checks:

- `/discovery` remains additive and scoped under `data-brand="esd-2026"`.
- `/discovery` mobile no longer has dock/hero overlap; the dock is in normal page flow and the floating assistant button is hidden on small screens.
- `/discovery/overview` keeps route parity while using Libre Franklin, Discovery Blue active states, visible brand pattern bands, and blue-led preliminary finding cards.
- Secondary orange remains only as a small supporting accent in the pilot-data cards and scatter marks.

## Commands

```bash
npm test -- --run src/test/sidebarNav.test.tsx src/test/uiStore.test.ts src/test/discoveryRoutes.test.ts
npm run build
```
