# Legacy Dashboard UI Archive

Date: 2026-05-18
Reason: The canonical website UI now lives in `web/` and is served locally at `/` with the operator surface at `/overview`. The older static dashboard shell was retired so localhost, share tooling, and docs all point at the same React SPA used by Cloudflare Pages.
Reviewer: GitHub Copilot

| Original path | Archived copy | Replacement | Reason |
|---|---|---|---|
| `dashboard/index.html` | `archive/2026-05-18_legacy_dashboard_ui/dashboard/index.html` | `web/src/routes/Landing.tsx` and `web/src/routes/Overview.tsx` via `dashboard/server/live_dashboard_server.py` | Retired static HTML shell replaced by the canonical SPA routes. |
| `dashboard/app.js` | `archive/2026-05-18_legacy_dashboard_ui/dashboard/app.js` | `web/src/**` | Retired vanilla dashboard behavior replaced by the React SPA implementation. |
| `dashboard/styles.css` | `archive/2026-05-18_legacy_dashboard_ui/dashboard/styles.css` | `web/src/styles/**` and `web/src/index.css` | Retired static-site theme replaced by the canonical SPA styling system. |
| `dashboard/primitives.js` | `archive/2026-05-18_legacy_dashboard_ui/dashboard/primitives.js` | `web/src/components/**`, `web/src/lib/**`, and route-local UI logic | Retired helper library only supported the archived static shell. |

## Restore

1. Copy the archived files back into `dashboard/`.
2. Revert the deprecation stubs in the live paths.
3. Remove or relax the `/dashboard` redirect in `dashboard/server/live_dashboard_server.py`.
4. Restore any `/dashboard/` assumptions in sharing or smoke-test tooling only if the static shell is intentionally revived.
