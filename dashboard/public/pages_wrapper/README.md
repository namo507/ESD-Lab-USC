# Cloudflare Pages wrapper — `esd-lab-namo.pages.dev`

This folder is the **canonical, tracked source** for the Cloudflare Pages
wrapper that the team shares as the public NANO Study dashboard URL:

> Canonical public URL: **https://esd-lab-namo.pages.dev/**

The wrapper is a tiny static page that iframes whichever dashboard origin is
currently live (named tunnel or quick tunnel). The wrapper's **own URL never
changes**; only the origin it points at can change.

## Files

| Path | Role | Tracked? |
|------|------|----------|
| `template.html` | Source-of-truth template with `{{DASHBOARD_URL}}` placeholders. | yes |
| `index.html` | Most recently rendered preview — useful for diffing what's live. | yes |
| `manifest.json` | Origin + timestamp + tunnel kind from the last render. | yes |
| `../../../dist/pages-wrapper/index.html` | Deploy artifact (uploaded to Pages). | no (`.gitignore`) |

## Rebuild

The share script rebuilds the wrapper automatically every time it produces a
public origin URL. To rebuild manually:

```bash
make pages-build ORIGIN=https://<your>.trycloudflare.com
# or, with a stable named tunnel:
make pages-build ORIGIN=https://dashboard.esdlabsc.com KIND=named
```

Validate the template alone:

```bash
python scripts/build_pages_wrapper.py --check
```

## Deploy

The deploy artifact lives at `dist/pages-wrapper/index.html`. Use either:

1. **Wrangler (recommended):**
   ```bash
   npx wrangler pages deploy dist/pages-wrapper --project-name esd-lab-namo
   ```
2. **Git-connected branch:** the operator's existing
   `esd-lab-namo` Pages project is wired to a branch — push the regenerated
   `dashboard/public/pages_wrapper/index.html` to that branch and Pages
   redeploys automatically. Confirm the project's build-output directory is
   pointed at `dashboard/public/pages_wrapper/` (or copy the file into the
   branch's root before pushing).

## Why this matters

- The wrapper URL is the **only** link operators should publish.
- The iframe target (origin) is allowed to change every restart.
- `manifest.json` records when the wrapper was last regenerated so anyone can
  tell whether it's fresh.
- No `trycloudflare.com` hostname is hard-coded anywhere; it always comes from
  whatever the share script just produced.

## Recovery from a stale wrapper

If the public Pages URL still shows a dead origin after `make dashboard-share`:

1. Run the share command (it should rebuild the wrapper automatically).
2. Check `manifest.json` — `dashboard_url` should match the URL the share
   script just printed.
3. Redeploy via `wrangler pages deploy dist/pages-wrapper --project-name esd-lab-namo`.

If the deploy step is skipped, the canonical URL keeps serving the previous
artifact and the iframe will fail to load until you push.
