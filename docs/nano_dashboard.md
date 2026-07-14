# NANO Study dashboard

The NANO Study dashboard is an additive dashboard surface at
`/nano/dashboard`. It does not replace the existing NANO latent growth curve
route at `/nano/lgcm-trajectories`, the operator overview, the public landing
page, or any Discovery routes.

The public route is:

```text
https://esd-lab-namo.pages.dev/nano/dashboard
```

## What the dashboard shows

The route presents a progressive overview of the Neurodevelopment of
Autonomic and Neural Organization study:

1. Study status and the heart-defined attention pulse
2. Enrollment, baseline RSA, quality, and REDCap health KPIs
3. Enrollment and recruitment funnel aggregates
4. Visit schedule counts for NICU admission through month 36
5. Data pipeline stage counts and quality pass rates
6. HDA, RSA, and temperature research aggregates
7. Assessment completion aggregates
8. Equipment, compliance, and REDCap operations
9. The existing non-PHI reading and SOP library
10. ESD Lab Buddy assistance

The page uses the ESD discovery-blue design tokens, imagery, and motion
vocabulary supplied with the dashboard design reference. Motion is disabled
when the browser requests reduced motion. Detailed figures are placed behind
native disclosure controls so the first view stays concise.

## Data contract

The backend keeps the canonical generated payload used by existing dashboards:

```text
dashboard/data/dashboard_data.json
```

New dashboard metrics live under its additive `nano` namespace. The same atomic
build writes a dedicated browser artifact:

```text
dashboard/data/nano_dashboard_data.json
```

The NANO route fetches only this aggregate artifact, so participant-operation
rows retained for older internal dashboards are never transferred to the NANO
page. The producer derives the namespace from de-identified aggregate inputs
already used by the dashboard pipeline. It emits a complete synthetic profile
when the secure mount is unavailable. The source and as-of date are shown in
the UI.

The public contract contains no participant rows, identifiers, dates of birth,
medical record numbers, free-text notes, or raw physiological signals. Visit
operations are counts only. A missing or null metric renders as `Awaiting data`;
a measured zero renders as `0`.

Refresh the payload and repository grounding index with:

```bash
make dashboard-refresh
```

## ESD Lab Buddy

The dashboard reuses the repository's existing assistant runtime and global
chat drawer. It does not introduce a second model service. The NANO-specific
contract is available at:

```text
GET  /api/buddy
POST /api/buddy
```

The POST body is:

```json
{
  "message": "How many month 3 visits are overdue?",
  "context": { "section": "nano", "as_of": "2026-07-14" }
}
```

Responses include `answer`, `citations`, `used_metrics`, and `refused`.
Only allowlisted aggregate metrics and non-PHI repository documents are used
for grounding. Requests for a participant, raw signal, direct identifier, or
free-text record are refused and redirected to approved REDCap or secure-server
workflows. Provider failures do not block dashboard metrics, and local
document or deterministic metric answers remain available when possible.

## Local run and verification

Build the data, start the existing runtime, and run smoke checks:

```bash
make dashboard-refresh
make dashboard-up
make dashboard-smoke
make docker-health
```

Frontend and contract checks can be run without Docker:

```bash
npm --prefix web run typecheck
npm --prefix web test
python3 -m pytest tests/test_dashboard_contract.py \
  tests/test_dashboard_assistant.py \
  tests/test_dashboard_runtime.py -q
make pages-build
```

`make dashboard-smoke` verifies the new SPA route, the generated `nano`
namespace, and the Buddy health contract in addition to the existing routes.
`make pages-build` packages the same route into the existing Cloudflare Pages
artifact.

## Deployment

The NANO route uses the existing Cloudflare Pages project and `/api/*` worker.
No rotating quick-tunnel hostname is committed or embedded. A stable backend
origin can be configured with `PAGES_API_ORIGIN`; otherwise the packaged edge
fallback keeps aggregate metric and privacy-safe assistance available.

Pushes to `main` that change the frontend, aggregate payload, producer,
assistant, or Pages packager trigger the existing deploy workflow. After a
deployment, verify both the route and Buddy:

```bash
curl -fsS https://esd-lab-namo.pages.dev/nano/dashboard >/dev/null
curl -fsS https://esd-lab-namo.pages.dev/api/buddy
curl -fsS https://esd-lab-namo.pages.dev/api/buddy \
  -H 'Content-Type: application/json' \
  --data '{"message":"What is the REDCap sync status?","context":{"section":"nano"}}'
```

## Privacy invariant

The repository HIPAA warning remains authoritative. Never extend the public
contract or Buddy grounding with participant-level rows, identifier tokens,
raw ECG or temperature traces, protected free text, secure-mount contents, or
REDCap record values. Add new public metrics only as reviewed aggregates.
