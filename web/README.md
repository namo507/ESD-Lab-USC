# NANO Dashboard Frontend

`web/` is the canonical browser frontend for the ESD Lab NANO dashboard.
Cloudflare Pages deploys the Vite build from this directory, and the local
Python runtime serves the same built SPA from `web/build/`.

## Ownership

| Path | Purpose |
|------|---------|
| `src/` | React 18 + TypeScript app, routes, components, hooks, API clients |
| `public/` | Static assets copied into the Vite build |
| `lab-readings.json` | Browser-sized reading index generated from `dashboard/data/readings_data.json` |
| `build/` | Generated Vite output; ignored by git |

The retired monolithic exports (`dashboard-source.html`, `pages-overlay.css`,
and `pages-overlay.js`) are intentionally ignored and not deployed. If a design
export is needed for reference, keep it under `design-ideas/` or `archive/`,
not in this frontend package.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm run typecheck
npm run test
```

Run commands from `web/`. The Vite dev server proxies `/api` to the local
dashboard runtime at `http://127.0.0.1:8080`.

## Deployment Contract

1. `npm run build` writes `web/build/`.
2. `python scripts/build_pages_site.py` packages `web/build/` into
   `dist/pages-wrapper/`.
3. `.github/workflows/deploy-pages.yml` deploys `dist/pages-wrapper/` to
   Cloudflare Pages.

Routes are declared in `src/App.tsx`. Route-level implementation files live in
`src/routes/`; see `src/routes/README.md` for the grouping contract.
