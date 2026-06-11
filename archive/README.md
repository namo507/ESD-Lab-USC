# Archive

This directory stores intentionally preserved legacy code and migration
snapshots. The files are not part of the active runtime or Cloudflare Pages
deployment.

| Batch | Reason |
|-------|--------|
| `2026-04-17_dashboard_refactor/` | Retired duplicated REDCap audit code |
| `2026-05-18_legacy_dashboard_ui/` | Retired static dashboard shell now replaced by `web/` |

Use `docs/archive_manifest.md` for restoration notes and replacement paths.
New archive batches should include their own `MANIFEST.md` and a short entry in
`docs/archive_manifest.md`.
