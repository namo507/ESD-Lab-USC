# ESD Discovery Brand Preview

Implemented as an additive, feature-flagged surface.

- Flag: `BRAND_ESD_2026` in `web/src/config/featureFlags.ts`.
- Review paths: `/discovery` for the branded landing page and `/discovery/overview` for the branded dashboard shell.
- Default paths such as `/` and `/overview` remain the current garnet/serif dashboard.
- Scoped CSS lives in `web/src/styles/brand-esd.css` and only applies under `data-brand="esd-2026"`.
- Local brand assets used by the preview live in `web/src/assets/brand-esd/`.

To disable the preview, set `BRAND_ESD_2026` to `false`; the sidebar preview group and Discovery routes will disappear or redirect back to the default landing page.
