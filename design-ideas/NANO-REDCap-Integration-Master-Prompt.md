# MASTER PROMPT: REDCap to Live Dashboard Integration (v2, Verified)

## NANO Study Surveys · PID 5955 · USC REDCap v16.0.18 · github.com/namo507/ESD-Lab-USC

**Repository:** [https://github.com/namo507/ESD-Lab-USC](https://github.com/namo507/ESD-Lab-USC) **Author:** Namit Shrivastava ([namit507@sc.edu](mailto:namit507@sc.edu)) · ESD Lab, University of South Carolina **REDCap instance:** [https://redcap.research.sc.edu](https://redcap.research.sc.edu) · **API:** [https://redcap.research.sc.edu/api/](https://redcap.research.sc.edu/api/) **Live dashboards:** [https://esd-lab-namo.pages.dev/](https://esd-lab-namo.pages.dev/) and [https://esd-lab-namo.pages.dev/redcap](https://esd-lab-namo.pages.dev/redcap) **Stack (verified in repo):** React \+ Vite \+ TypeScript front end · Python (PyCap) and R pipelines · local llama.cpp grounded assistant · Cloudflare Pages \+ Pages Functions · GitHub Actions **Status:** Token approved. Project structure verified live against the API on 2026-06-24.

---

## SECURITY NOTICE, READ FIRST

The token `55D6F4DA0C2D702CE76C5AB47AC788AB` is a full-access password to PID 5955\. This master prompt file is intentionally kept OUT of the repository. Do not commit it. The token must live only in: `.env` (local), `.dev.vars` (local Wrangler), GitHub Actions Secrets, and Cloudflare Pages environment variables. Every committed code example below uses the variable name (`REDCAP_API_KEY` / `REDCAP_API_TOKEN`), never the literal value. After you finish local setup, vault or delete this file.

---

## 0\. How to use this prompt

This is a single, self-contained build brief for a coding agent (or for you) working inside the existing `ESD-Lab-USC` repository. It is written to be executed top to bottom. It does three things the previous draft did not:

1. It is grounded in the real project. Every event, instrument, field, route, and component name below was verified either against the live REDCap API or against the actual files in the repo on 2026-06-24. Where the earlier draft invented names, those are corrected in Section 2\.  
2. It respects what already exists. Section 3 is a reality map separating what is already built (do not recreate) from what is genuinely missing (build this). The earlier draft told you to create `web/src/routes/Redcap.tsx` and `web/src/components/redcap/`, but `Redcap.tsx` already exists and the component layout is different. Following the old instructions verbatim would have produced duplicate, conflicting files.  
3. It makes updates self-propagating. Section 7 through 9 wire the data pipeline so a single `git push` (or a nightly cron) refreshes the data JSON, the AI Buddy grounding, the Ask AI knowledge base, and every metric visualization without any manual step. This is the "symmetry alignment" you asked for: one source of truth, many synchronized surfaces.

Read Sections 1 to 4 fully before writing any code. They define the contract that keeps the front end and back end consistent.

---

## 1\. Mission

**Objective:** Integrate REDCap PID 5955 into the ESD-Lab-USC dashboards so that participant visit health, instrument completeness, and carry-forward anomaly signals flow automatically from REDCap into the live site, the grounded AI Buddy, the Ask AI drawer, and the metric visualizations, with the front end and back end sharing one canonical data contract.

**Outcomes that define success:**

- A nightly (and on-demand) pipeline pulls PID 5955, strips PHI, and writes REDCap sections into the same `dashboard/data/dashboard_data.json` the site already serves.  
- The local assistant (`dashboard/assistant/local_chat_assistant.py`) grounds answers on the new REDCap sections with zero code change at answer time, because it already reads that payload. New work only adds a REDCap retrieval section and freshness signal.  
- The `/redcap` route and the public insight tiles render the new data and redeploy automatically on push.  
- A schema-parity test fails CI if the Python list of events, the R list, the TypeScript constants, the Zod enum, and the context-skill glossary ever drift apart.  
- No token ever reaches the browser; all live calls route through a Cloudflare Pages Function that does not yet exist and must be created.

---

## 2\. Ground truth: verified REDCap structure (corrects the prior draft)

I verified the following live against `https://redcap.research.sc.edu/api/` for PID 5955\. Treat this section as authoritative and overwrite any conflicting values elsewhere in the codebase.

### 2.1 Project facts

| Field | Verified value |
| :---- | :---- |
| Project title | Namit \- NANO Study Surveys |
| PID | 5955 |
| Longitudinal | Yes (`is_longitudinal = 1`) |
| Repeating instruments/events | No (`has_repeating_instruments_or_events = 0`) |
| Surveys enabled | Yes |
| Missing data codes | `SKIP` \= "Skipped visit not completed" |
| Arms | 1 (label: Visit Specific) |
| Instruments | 56 |
| Fields in data dictionary | 3995 |
| Form-event mappings | 130 |

### 2.2 The 12 events (verified, use verbatim)

```
consent_arm_1        # Consent
caregiver_1_arm_1    # Caregiver 1
caregiver_2_arm_1    # Caregiver 2
sibling_arm_1        # Sibling
1_month_arm_1        # 1 Month
2_months_arm_1       # 2 Months
3_months_arm_1       # 3 Months
6_months_arm_1       # 6 Months
9_months_arm_1       # 9 Months
12_months_arm_1      # 12 Months
24_months_arm_1      # 24 Months
36_months_arm_1      # 36 Months
```

Correction: the repo file `dashboard/context_skill/references/tables/redcap.md` currently claims "one of the 9 NANO events" and references `baseline_arm_1` plus groups `ASIB / PT / TD`. None of those exist in PID 5955\. That glossary describes a different or synthetic dataset and must be rewritten from the real structure (see Section 7.3). This is the single most important consistency fix in this whole brief, because the AI Buddy reads that file.

### 2.3 Key instruments (verified subset of the 56\)

The carry-forward feature and the visit-health monitor depend on these real instrument names. The earlier draft listed `demographics`, `mchat_r_tf`, `asq3_milestones`, `prapare_sdoh`, `ecg_recording_log`, `bayley4_scores`, `ados2_scores`. Those names are not in this project. Use the verified names below.

| Real instrument (API name) | Label | Notes |
| :---- | :---- | :---- |
| `visit_occurred` | Visit Occurred? | Holds `visit_date` and `visit_date_2`. This is the visit anchor, not a `demographics` form. |
| `csbs_caregiver` | CSBS Caregiver | The carry-forward subject. Mapped to 6m, 9m, 12m, AND 24m (the prior draft said 6/9/12 only). |
| `medication_questionnaire` | Medication Questionnaire | Auto-Continue anchor referenced by the FDL fix. |
| `demographics_complete_this_first` | Demographics Complete This First | The real demographics form. |
| `questionnaires_to_send` | Questionnaires to Send | Survey queue driver (`send_*` fields). |
| `edinburgh_postnatal_depression_scale` | Edinburgh Postnatal Depression Scale | The real EPDS instrument. |
| `ages_stages_questionnaire_24_months` / `ages_stages_questionnaire_36_months` | ASQ 24m / 36m | Replaces the invented `asq3_milestones`. |
| `ados_module_1` / `ados_module_2` / `ados_module_3` / `ados_score` | ADOS modules \+ score | Replaces the invented `ados2_scores`. |
| `vineland`, `srs_preschool`, `mcdi_words_gestures`, `infant_behavior_questionnaire_revised_very_short_f` | Various | Real instruments available for future tiles. |

Always re-verify field-level names against the live metadata before hardcoding them. Pull the dictionary with `content=metadata` and the form-event map with `content=formEventMapping`. Do not invent field names. If a field cannot be confirmed in the metadata export, leave a `TODO(verify)` marker rather than guessing.

### 2.4 `visit_date` availability (verified form-event map)

`visit_occurred.visit_date` exists at: `1_month_arm_1`, `2_months_arm_1`, `3_months_arm_1`, `6_months_arm_1`, `9_months_arm_1`, `12_months_arm_1`, `24_months_arm_1`, `36_months_arm_1`. It is NOT present at consent, caregiver, or sibling events. Any logic that reads `visit_date` at a non-visit event must treat it as absent rather than failing.

### 2.5 `_complete` status reference (REDCap standard)

| Value | Meaning | UI color token |
| :---- | :---- | :---- |
| `"0"` | Incomplete | red |
| `"1"` | Unverified | amber |
| `"2"` | Complete | green |
| `""` | Not started | grey |
| `"SKIP"` | Skipped visit not completed (missing data code) | blue |

### 2.6 Carry-forward anomaly codes (kept, with mapping corrected)

| Code | Meaning |
| :---- | :---- |
| R1 | 6m CSBS incomplete and 9m `visit_date` set (active carry-forward risk) |
| R2 | 9m CSBS incomplete and 12m `visit_date` set (active carry-forward risk) |
| R3 | 6m CSBS blank but 9m CSBS complete (historical shift) |
| R4 | 9m CSBS blank but 12m CSBS complete (cascading historical shift) |
| R5 | 12m CSBS incomplete and 24m `visit_date` set (new, because CSBS now extends to 24m) |

---

## 3\. Repo reality map: what exists vs what to build

Before writing anything, reconcile with the real tree. The paths below were confirmed in the repository. Do not recreate files marked EXISTS; extend them in place so the diff stays small and review stays clean.

### 3.1 Already built (extend, do not recreate)

| Path | What it is | Your action |
| :---- | :---- | :---- |
| `web/src/routes/Redcap.tsx` (+ `Redcap.module.css`) | The `/redcap` page, already routed in `web/src/App.tsx` | Extend to render visit-health \+ completeness from the new JSON keys |
| `web/src/routes/PublicInsights.tsx` (+ css) | Public `/public-insights` page | Add REDCap metric insight tiles |
| `web/src/components/insights/` (`InsightSection`, `CdcStyleLine`, `CumulativeCurve`, `DualGroupComparator`) | Insight viz primitives | Reuse for REDCap completeness and anomaly trend |
| `web/src/components/charts/` (`EnrollmentBar`, `TrajectoryChart`, `HDABarStack`, `RsaGrowthChart`, `HdaTimeline`) | Chart components | Reuse `HDABarStack` for stacked completeness; do not write a new chart lib |
| `web/src/components/shell/Buddy.tsx` \+ `ChatDrawer.tsx` \+ `web/src/api/chatApi.ts` | The AI Buddy and Ask AI drawer plus their fetch layer | Add REDCap suggested chips \+ surface REDCap freshness; no new chat transport |
| `dashboard/assistant/local_chat_assistant.py` | Local grounded assistant; `build_context()` already loads `dashboard/data/dashboard_data.json` | Add a `redcap_visit_health` retrieval section \+ freshness; it auto-grounds once the JSON carries the keys |
| `dashboard/assistant/model_catalog.py` \+ `config/llm_model.json` | Local GGUF model selection (SmolLM2 1.7B default, Qwen2.5 fallbacks), policy `local-free-no-api` | Leave model logic alone; only feed it better grounding |
| `dashboard/context_skill/` (`SKILL.md`, `extract_context.py`, `references/*.md`) | The knowledge base the assistant and analysts read | Rewrite `references/tables/redcap.md` to the real schema; extend `extract_context.py` to validate against live metadata |
| `dashboard/pipelines/build_dashboard_data.py` (+ `.R`) | Builds `dashboard_data.json` in Python and R | Add REDCap section builders to BOTH for parity |
| `redcap/api/redcap_pull.py`, `redcap_push.py`, `redcap_audit.py`, `redcap_r_pull.R` | Pull/push/audit clients | Reuse; align constants to the symmetry contract |
| `redcap/quality_control/` \+ `redcap/hooks/` \+ `redcap/instruments/` | QC pipeline, REDCap JS hooks, field-mapping CSVs | Reference, do not duplicate |
| `scripts/redcap_daily_sync.py`, `run_full_pipeline.sh`, `prepare_dashboard_assistant.py`, `check_live_surfaces.py`, `check_github_workflows.py` | Existing automation | Chain into, do not replace |
| `config/redcap_config.yml`, `model_config.yml`, `study_parameters.yml`, `paths.yml` | Config | `redcap_config.yml` becomes the canonical contract (Section 4\) |

### 3.2 Genuinely missing (build these)

| Path | Why it is missing | Build it as |
| :---- | :---- | :---- |
| `functions/api/redcap.js` | `functions/` is empty; the live proxy does not exist yet | Cloudflare Pages Function, token server-side (Section 5.4) |
| `web/src/api/redcapClient.ts` | No proxy wrapper on the client | Thin `fetch('/api/redcap')` wrapper |
| `web/src/api/redcapSchemas.ts` | No Zod schema for the REDCap JSON keys | Zod mirror of the contract (Section 4\) |
| `web/src/constants/redcapConfig.ts` | No shared TS constants | Generated from the contract, not hand-typed (Section 4.3) |
| `.github/workflows/redcap_sync.yml` and `deploy-pages.yml` | Confirm presence under `.github/workflows/`; create or update so the chain in Section 9 runs | CI chain that propagates to assistant \+ viz |

Action item: run `ls .github/workflows` and `ls functions` first. Build only what is absent. If a workflow already exists, edit it to add the context-regen and assistant-reindex steps rather than adding a parallel workflow.

---

## 4\. The symmetry contract (single source of truth)

This is the heart of the "consistency and symmetry alignment" requirement. Five surfaces describe the same REDCap reality: Python, R, TypeScript constants, the Zod runtime schema, and the context-skill Markdown. They drift the moment a human edits one and forgets the others. The fix is to make `config/redcap_config.yml` the only place a human edits, and to generate or validate everything else from it.

### 4.1 Canonical contract file: `config/redcap_config.yml`

Extend the existing file to this shape. Everything downstream reads from here.

```
# config/redcap_config.yml  : CANONICAL CONTRACT. Edit here, never downstream.
api:
  base_url: "${REDCAP_API_URL}"      # never the token; only the URL
  format: "json"
  type: "flat"
  chunk_size: 500
  timeout_seconds: 120
  verify_ssl: true                    # never false

project:
  pid: 5955
  title: "Namit - NANO Study Surveys"
  is_longitudinal: true
  missing_data_codes: ["SKIP"]

events:                               # the verified 12, in protocol order
  order:
    - consent_arm_1
    - caregiver_1_arm_1
    - caregiver_2_arm_1
    - sibling_arm_1
    - 1_month_arm_1
    - 2_months_arm_1
    - 3_months_arm_1
    - 6_months_arm_1
    - 9_months_arm_1
    - 12_months_arm_1
    - 24_months_arm_1
    - 36_months_arm_1
  visit_events:                       # events where visit_occurred.visit_date exists
    - 1_month_arm_1
    - 2_months_arm_1
    - 3_months_arm_1
    - 6_months_arm_1
    - 9_months_arm_1
    - 12_months_arm_1
    - 24_months_arm_1
    - 36_months_arm_1

instruments:
  visit_anchor: visit_occurred
  visit_date_field: visit_date
  carry_forward:
    instrument: csbs_caregiver
    complete_field: csbs_caregiver_complete
    events: [6_months_arm_1, 9_months_arm_1, 12_months_arm_1, 24_months_arm_1]
  auto_continue_anchor: medication_questionnaire

status_codes:                         # _complete values + UI color token name
  "0":   { label: Incomplete,  token: status-red }
  "1":   { label: Unverified,  token: status-amber }
  "2":   { label: Complete,    token: status-green }
  "":    { label: Not started, token: status-grey }
  "SKIP":{ label: Skipped,     token: status-blue }

anomaly_codes:
  R1: "6m CSBS incomplete and 9m visit_date set"
  R2: "9m CSBS incomplete and 12m visit_date set"
  R3: "6m CSBS blank but 9m CSBS complete"
  R4: "9m CSBS blank but 12m CSBS complete"
  R5: "12m CSBS incomplete and 24m visit_date set"

phi_fields:                           # stripped before any JSON is written
  - first_name
  - last_name
  - child_dob
  - caregiver_name
  - caregiver_phone
  - street_address
  - email
  - mrn
  - record_id_original
```

### 4.2 Propagation rules (how each surface stays symmetric)

| Surface | How it gets the contract | Drift guard |
| :---- | :---- | :---- |
| Python (`build_dashboard_data.py`, `redcap_pull.py`) | `yaml.safe_load("config/redcap_config.yml")` at import | unit test asserts loaded lists match a frozen snapshot |
| R (`build_dashboard_data.R`, `redcap_r_pull.R`) | `yaml::read_yaml("config/redcap_config.yml")` | `extract_context.py` checks R reads the same keys |
| TS constants (`web/src/constants/redcapConfig.ts`) | GENERATED by `scripts/gen_redcap_constants.mjs` from the YAML at build time | file header marks it generated; CI fails if stale |
| Zod (`web/src/api/redcapSchemas.ts`) | status enum \+ anomaly enum imported from generated constants | type-checks against generated union |
| Context skill (`references/tables/redcap.md`) | regenerated section by `extract_context.py --emit` | `--check` mode fails CI on drift |

### 4.3 Generator: `scripts/gen_redcap_constants.mjs`

Create this so the front end never hand-copies event names. It reads the YAML and writes `web/src/constants/redcapConfig.ts` with a `DO NOT EDIT, generated` banner. Run it in the build step before `vite build`. This is what guarantees the front-end event list can never disagree with the Python list: both descend from one YAML.

```javascript
// scripts/gen_redcap_constants.mjs : generate TS constants from the canonical YAML.
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";

const c = parse(readFileSync("config/redcap_config.yml", "utf8"));
const banner = "// AUTO-GENERATED from config/redcap_config.yml by scripts/gen_redcap_constants.mjs.\n// DO NOT EDIT BY HAND. Run `node scripts/gen_redcap_constants.mjs` to refresh.\n";
const ts = `${banner}
export const REDCAP_PROXY_URL = "/api/redcap";
export const PID = ${c.project.pid};
export const EVENT_ORDER = ${JSON.stringify(c.events.order, null, 2)} as const;
export const VISIT_EVENTS = ${JSON.stringify(c.events.visit_events, null, 2)} as const;
export const CARRY_FORWARD = ${JSON.stringify(c.instruments.carry_forward, null, 2)} as const;
export const STATUS_CODES = ${JSON.stringify(c.status_codes, null, 2)} as const;
export const ANOMALY_CODES = ${JSON.stringify(c.anomaly_codes, null, 2)} as const;
export type CsbsStatus = keyof typeof STATUS_CODES;
export type AnomalyCode = keyof typeof ANOMALY_CODES;
`;
writeFileSync("web/src/constants/redcapConfig.ts", ts);
console.log("Wrote web/src/constants/redcapConfig.ts from canonical YAML.");
```

---

## 5\. Backend and pipeline integration

### 5.1 The JSON payload contract (what the pipeline writes, what everyone reads)

This is the contract object. The Python builder writes it, the R builder must produce the byte-identical shape, the Zod schema validates it, the React components render it, and the assistant grounds on it. Append these keys to the existing `dashboard/data/dashboard_data.json`; do not create a separate file, because the assistant and the site already load this one.

```
{
  // ... existing dashboard keys stay untouched ...
  "redcap_meta": {
    "generated_at": "2026-06-24T08:00:00Z",
    "pid": 5955,
    "record_count": 0,
    "anomaly_count": 0,
    "source": "redcap-api",          // or "synthetic-fallback"
    "contract_version": "2.0"
  },
  "redcap_completion_stats": {
    "6_months_arm_1":  { "label": "6m",  "complete": 0, "unverified": 0, "incomplete": 0, "not_started": 0, "skipped": 0, "total": 0 },
    "9_months_arm_1":  { "label": "9m",  "complete": 0, "unverified": 0, "incomplete": 0, "not_started": 0, "skipped": 0, "total": 0 },
    "12_months_arm_1": { "label": "12m", "complete": 0, "unverified": 0, "incomplete": 0, "not_started": 0, "skipped": 0, "total": 0 },
    "24_months_arm_1": { "label": "24m", "complete": 0, "unverified": 0, "incomplete": 0, "not_started": 0, "skipped": 0, "total": 0 }
  },
  "redcap_visit_health": {
    "anomaly_count": 0,
    "data": [
      {
        "recordId": "NANO-1A2B3C4D",
        "sixMonth":    { "visitDate": "", "csbsStatus": "" },
        "nineMonth":   { "visitDate": "", "csbsStatus": "" },
        "twelveMonth": { "visitDate": "", "csbsStatus": "" },
        "twentyFourMonth": { "visitDate": "", "csbsStatus": "" },
        "anomalyFlags": ["R1"],
        "hasCarryForwardRisk": true
      }
    ]
  }
}
```

### 5.2 Python builder (extend `dashboard/pipelines/build_dashboard_data.py`)

Add three functions and call them from the existing `main()`. Read constants from the contract, not from literals. The assistant grounds on the result automatically, so correctness here is correctness everywhere.

```py
import yaml
from pathlib import Path

_C = yaml.safe_load(Path("config/redcap_config.yml").read_text())
CF = _C["instruments"]["carry_forward"]
VISIT_FIELD = _C["instruments"]["visit_date_field"]
CSBS_FIELD = CF["complete_field"]
CSBS_EVENTS = CF["events"]                       # [6m, 9m, 12m, 24m] from the contract
PHI_FIELDS = _C["phi_fields"]

def build_redcap_completion_stats(df):
    stats = {}
    for ev in CSBS_EVENTS:
        sub = df[df["redcap_event_name"] == ev]
        vc = sub[CSBS_FIELD].value_counts().to_dict() if CSBS_FIELD in sub else {}
        stats[ev] = {
            "label": ev.replace("_arm_1", "").replace("_months", "m").replace("_month", "m"),
            "complete": int(vc.get("2", 0)), "unverified": int(vc.get("1", 0)),
            "incomplete": int(vc.get("0", 0)), "not_started": int(vc.get("", 0)),
            "skipped": int(vc.get("SKIP", 0)), "total": int(len(sub)),
        }
    return stats

def _flags(ev):  # ev: dict event_name -> row dict
    e = lambda k: ev.get(k, {})
    six, nine, twelve, tfour = e("6_months_arm_1"), e("9_months_arm_1"), e("12_months_arm_1"), e("24_months_arm_1")
    f = []
    if six.get(CSBS_FIELD) == "0" and nine.get(VISIT_FIELD):     f.append("R1")
    if nine.get(CSBS_FIELD) == "0" and twelve.get(VISIT_FIELD):  f.append("R2")
    if not six.get(CSBS_FIELD) and nine.get(CSBS_FIELD) == "2":  f.append("R3")
    if not nine.get(CSBS_FIELD) and twelve.get(CSBS_FIELD) == "2":f.append("R4")
    if twelve.get(CSBS_FIELD) == "0" and tfour.get(VISIT_FIELD): f.append("R5")
    return f

def build_redcap_visit_health(df):
    out = []
    for rid, grp in df.groupby("record_id"):
        ev = {r["redcap_event_name"]: r.to_dict() for _, r in grp.iterrows()}
        def sm(name): 
            e = ev.get(name, {}); 
            return {"visitDate": e.get(VISIT_FIELD, ""), "csbsStatus": e.get(CSBS_FIELD, "")}
        flags = _flags(ev)
        out.append({
            "recordId": str(rid),
            "sixMonth": sm("6_months_arm_1"), "nineMonth": sm("9_months_arm_1"),
            "twelveMonth": sm("12_months_arm_1"), "twentyFourMonth": sm("24_months_arm_1"),
            "anomalyFlags": flags, "hasCarryForwardRisk": len(flags) > 0,
        })
    return sorted(out, key=lambda r: r["hasCarryForwardRisk"], reverse=True)
```

In `main()`, after PHI is dropped, merge the three keys (`redcap_meta`, `redcap_completion_stats`, `redcap_visit_health`) into the existing payload dict before it is written. Keep the existing keys intact.

### 5.3 R parity (extend `dashboard/pipelines/build_dashboard_data.R`)

The repo ships a Python and an R builder. Symmetry requires both to emit the identical contract. Add `build_redcap_completion_stats()` and `build_redcap_visit_health()` in R, reading the same `config/redcap_config.yml` via `yaml::read_yaml`, and serialize with `jsonlite::toJSON(..., auto_unbox = TRUE)`. The drift guard in `extract_context.py` (Section 7.4) checks that the R file references `redcap_visit_health` and `csbs_caregiver_complete`, so do not rename these keys in only one language.

### 5.4 Cloudflare Pages Function (CREATE: `functions/api/redcap.js`)

`functions/` is empty today, so live proxy calls have nowhere to land. Create this file. It injects the token from Cloudflare's encrypted env and forwards to REDCap so the browser never sees the credential.

```javascript
// functions/api/redcap.js : server-side REDCap proxy. Token stays in Cloudflare env.
// Cloudflare Pages → Settings → Environment Variables:
//   REDCAP_API_TOKEN = <token>   (do NOT prefix with VITE_)
//   REDCAP_API_URL   = https://redcap.research.sc.edu/api/
export async function onRequestPost(context) {
  const { REDCAP_API_TOKEN, REDCAP_API_URL } = context.env;
  if (!REDCAP_API_TOKEN || !REDCAP_API_URL)
    return json({ error: "REDCap env vars not set in Cloudflare Pages." }, 500);
  let body;
  try { body = await context.request.json(); }
  catch { return json({ error: "Invalid JSON body." }, 400); }

  // Allowlist: the browser may only ask for read content. Writes go server-side only.
  const allowed = new Set(["project", "metadata", "event", "formEventMapping", "record"]);
  if (body.content && !allowed.has(body.content))
    return json({ error: `content '${body.content}' not permitted via proxy.` }, 403);
  if (body.action === "import" || body.action === "delete")
    return json({ error: "Write actions are not allowed through the browser proxy." }, 403);

  const form = new URLSearchParams({ token: REDCAP_API_TOKEN, format: "json", returnFormat: "json", ...body });
  let r;
  try { r = await fetch(REDCAP_API_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }); }
  catch (e) { return json({ error: `Cannot reach REDCap: ${e.message}` }, 502); }
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
const json = (o, s) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
```

Security upgrade over the prior draft: the proxy here allowlists read content and refuses `import`/`delete`. Visit-date writes and SKIP codes must run from the server-side Python (`redcap/api/redcap_push.py`) under the audited token, never from a browser. This closes the hole where any visitor could POST writes to your project through an open proxy.

---

## 6\. Front-end integration (aligned to the real tree)

Match the actual `web/src` layout. Two data sources feed the UI: the committed `dashboard_data.json` (static, fast, always available) for completeness and visit health, and the live `/api/redcap` proxy (real-time, optional) for on-demand refresh. Default to the static JSON and treat the proxy as an enhancement, so the page renders even if the proxy is cold.

### 6.1 Runtime schema (CREATE `web/src/api/redcapSchemas.ts`)

```ts
import { z } from "zod";
import { STATUS_CODES, ANOMALY_CODES } from "@/constants/redcapConfig"; // generated

const statusKeys = Object.keys(STATUS_CODES) as [string, ...string[]];
export const CsbsStatus = z.enum(statusKeys);

export const Timepoint = z.object({ visitDate: z.string(), csbsStatus: CsbsStatus });
export const VisitRecord = z.object({
  recordId: z.string(),
  sixMonth: Timepoint, nineMonth: Timepoint, twelveMonth: Timepoint, twentyFourMonth: Timepoint,
  anomalyFlags: z.array(z.enum(Object.keys(ANOMALY_CODES) as [string, ...string[]])),
  hasCarryForwardRisk: z.boolean(),
});
export const CompletionStat = z.object({
  label: z.string(), complete: z.number(), unverified: z.number(),
  incomplete: z.number(), not_started: z.number(), skipped: z.number(), total: z.number(),
});
export const RedcapPayload = z.object({
  redcap_meta: z.object({
    generated_at: z.string(), pid: z.number(), record_count: z.number(),
    anomaly_count: z.number(), source: z.string(), contract_version: z.string(),
  }),
  redcap_completion_stats: z.record(CompletionStat),
  redcap_visit_health: z.object({ anomaly_count: z.number(), data: z.array(VisitRecord) }),
});
```

### 6.2 Proxy client (CREATE `web/src/api/redcapClient.ts`)

```ts
import { REDCAP_PROXY_URL } from "@/constants/redcapConfig";
export async function callREDCap<T = unknown>(payload: Record<string, string>): Promise<T> {
  const res = await fetch(REDCAP_PROXY_URL, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Proxy ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`REDCap: ${data.error}`);
  return data as T;
}
```

### 6.3 Extend `web/src/routes/Redcap.tsx` (do not recreate)

The route and CSS module already exist and are wired in `App.tsx`. Add, inside the existing page, a completeness panel and a visit-health table fed by the new JSON keys, reusing existing primitives so the visual language matches the rest of the site:

- Stacked completeness bars: reuse `web/src/components/charts/HDABarStack.tsx`, one stacked bar per CSBS event (6m, 9m, 12m, 24m) split by status color tokens from `STATUS_CODES`.  
- Anomaly banner: a `Card` (from `web/src/components/primitives`) showing `redcap_meta.anomaly_count` with the amber/red token, sorted so flagged records surface first.  
- Visit-health grid: rows are records, columns are 6m/9m/12m/24m, each cell a status pill (reuse `web/src/components/warm/StatusPill.tsx`), tooltip shows `visitDate` and the anomaly code meaning from `ANOMALY_CODES`.

Load order: read `/dashboard_data.json`, validate the REDCap slice with `RedcapPayload.partial()`, and render. Provide a "Refresh live" button that calls `callREDCap({ content: "project" })` only to display freshness, not to mutate the table. Keep all REDCap colors driven by the `status-*` design tokens in `web/src/styles/tokens.css` so dark mode and the existing palette stay consistent.

### 6.4 Public insight tiles (extend `web/src/routes/PublicInsights.tsx`)

Add a REDCap section using the existing `web/src/components/insights/InsightSection.tsx` wrapper plus `CumulativeCurve` (enrollment-style completeness over events) and `DualGroupComparator` (complete vs incomplete by event). These read the same JSON keys, so they update on every deploy with no per-tile data wiring.

### 6.5 Feature flags

The repo uses `web/src/config/featureFlags.ts` and `useFeatureFlag.ts`. Gate the new surfaces behind flags so they can ship dark and be toggled without a redeploy:

```
redcap.completeness   = true
redcap.visitHealth    = true
redcap.liveProxy      = true   // the "Refresh live" button
```

---

## 7\. AI Buddy and Ask AI: auto-grounding (the core requirement)

This is the part you most wanted: the Buddy and the Ask AI drawer must learn the new REDCap features automatically whenever the site updates, with no manual prompt edits. The good news from reading the code is that the architecture already supports this. The assistant is retrieval-grounded, not fine-tuned, so it answers from whatever is in its grounding payload and context skill. Feed those, and the assistant updates itself.

### 7.1 Why this works without retraining

`dashboard/assistant/local_chat_assistant.py::build_context()` already calls `_load_dashboard_payload()` (which reads `dashboard/data/dashboard_data.json`) and `_load_readings_payload()`, flattens them into retrievable fragments, scores them against the user question, and injects the top matches as the grounded context block. The model itself is a local GGUF (SmolLM2 1.7B by default, per `config/llm_model.json`, policy `local-free-no-api`). Because the new `redcap_*` keys live in that same JSON, the assistant can already cite them. The work is to (a) make sure those fragments are retrievable and well-labeled, (b) add a REDCap retrieval section so questions route correctly, and (c) surface a REDCap freshness signal in the status the UI already reads.

### 7.2 Add a REDCap retrieval section (edit `local_chat_assistant.py`)

The assistant has a section catalog (the `redcap_audit` section with keyword `redcap` already exists near lines 52 and 92). Add or extend a section so visit-health and completeness questions match:

```py
# in the SECTIONS / DOMAIN catalog
"redcap_visit_health": {
    "keywords": ["redcap", "csbs", "visit", "carry forward", "carry-forward",
                 "anomaly", "completeness", "incomplete", "6 month", "9 month",
                 "12 month", "24 month", "skip", "visit date"],
    "payload_keys": ["redcap_meta", "redcap_completion_stats", "redcap_visit_health"],
    "citation_prefix": "redcap",
},
```

In `build_context()`, when flattening `redcap_visit_health.data`, emit compact human-readable fragments so the small model can quote them, for example: `"Record NANO-1A2B3C4D: 6m CSBS incomplete, 9m visit scheduled, flags R1 (active carry-forward risk)."` and a roll-up fragment: `"REDCap completeness 9m: 14 complete, 3 incomplete, 2 not started, 1 skipped of 20."` Cap the number of per-record fragments (for example top 25 flagged) so you stay within the 4096-token context window noted in `config/llm_model.json`.

### 7.3 Rewrite the context skill (edit `dashboard/context_skill/references/tables/redcap.md`)

This Markdown is the durable knowledge the assistant and analysts read. The current version is wrong for PID 5955 (fake `baseline_arm_1`, ASIB/PT/TD groups, "9 events"). Replace it with the verified structure: the 12 events, the `visit_occurred.visit_date` anchor, the `csbs_caregiver` carry-forward instrument and its 6m/9m/12m/24m mapping, the `_complete` status codes, the anomaly codes R1 to R5, and the JSON contract keys from Section 5.1. Also add a short "Where the dashboard gets each number" mapping (JSON key to UI widget) so the Buddy can answer "which field populates the anomaly KPI?". Keep it PHI-free, as the SKILL.md requires.

### 7.4 Make the skill self-updating (extend `dashboard/context_skill/extract_context.py`)

Today `extract_context.py --check` compares the pipeline code, the data dictionary, and the Markdown, and exits non-zero on drift. Extend it two ways:

1. Live verification mode `--verify-redcap`: pull `content=event`, `content=instrument`, and `content=formEventMapping`, then assert the events and the `csbs_caregiver` mapping in `config/redcap_config.yml` match the live project. This catches the exact class of bug that produced the stale `redcap.md`. It must read the token from the environment and never print it.  
2. Emit mode `--emit`: regenerate the machine-managed block of `references/tables/redcap.md` (and the `dashboard_schema.md` JSON-key table) from the canonical YAML plus the live metadata, between `<!-- AUTO:start -->` and `<!-- AUTO:end -->` markers, leaving human prose intact.

This is what turns "update the website" into "the Buddy already knows": the same CI job that refreshes data also runs `--emit`, so the knowledge base regenerates itself.

### 7.5 Re-index the assistant after data changes

`scripts/prepare_dashboard_assistant.py` bootstraps and inspects the assistant. Add (or confirm) an `--reindex` path that reloads the dashboard payload and rebuilds any cached fragment index, and call it in CI after the JSON is rebuilt. If the assistant indexes lazily on first request, instead bump a `payload_version` in `redcap_meta` and have the assistant invalidate its cache when that value changes, so the first question after a deploy sees fresh data.

### 7.6 Surface REDCap freshness in the UI (edit `web/src/api/chatApi.ts`)

`AssistantStatus.freshness` in `chatApi.ts` already carries a `readings` and a `pipeline` block. Add a `redcap` block:

```ts
freshness?: {
  readings?: { /* existing */ };
  pipeline?: { /* existing */ };
  redcap?: {
    generated_at?: string | null;
    record_count?: number | null;
    anomaly_count?: number | null;
    source?: string | null;          // "redcap-api" | "synthetic-fallback"
  };
};
```

Have the assistant status endpoint populate it from `redcap_meta`. Then the Buddy can answer "is the REDCap data fresh?" and the drawer can show an "as of" line and an anomaly count badge.

### 7.7 Suggested prompts in Buddy and ChatDrawer (edit `Buddy.tsx`, `ChatDrawer.tsx`)

Add REDCap quick chips so the new capability is discoverable: "How many carry-forward anomalies right now?", "Which records are flagged R1?", "Show 9-month CSBS completeness", "When was REDCap last synced?". Keep PHI scrubbing on outbound messages (the code already calls `scrubPhi` on user content in `chatApi.ts`); do not disable it. The chips are static UI; the answers come from the auto-grounded context, so they stay correct as data changes.

Net effect: after this section, the only artifact a human edits to teach the Buddy about a new REDCap concept is `config/redcap_config.yml` plus optional prose in `redcap.md`. Everything else (fragments, freshness, chips' answers) regenerates from the nightly payload.

---

## 8\. Metric visualizations: auto-update on every deploy

The insight and chart components read from `dashboard_data.json`, which CI commits. So the visualizations refresh whenever the data does, with no per-chart intervention. To make that reliable rather than incidental:

- Single fetch hook: add `useRedcapData()` (in `web/src/api/` next to the existing hooks) that fetches `/dashboard_data.json` once, validates the REDCap slice with `RedcapPayload.partial()`, and is consumed by `Redcap.tsx` and the `PublicInsights` tiles. One fetch, many charts, identical numbers everywhere (this is visual symmetry).  
- Tokens, not hex: every status color comes from `STATUS_CODES[...].token` resolved against `web/src/styles/tokens.css`. There is a `darkModeSurfaceGuard.test.ts` already in the suite; add a case so the new REDCap tokens pass dark mode contrast.  
- Empty and stale states: if `redcap_meta.source === "synthetic-fallback"` or `record_count === 0`, charts render a labeled "sample data" or "no records yet" state instead of an empty axis. The Buddy freshness block uses the same signal, so the page and the assistant never disagree about whether data is real.  
- No new chart dependency: reuse `HDABarStack`, `CumulativeCurve`, `DualGroupComparator`, `InsightSection`. The repo already standardizes on these; adding a new charting library would break visual symmetry and bloat the bundle.

---

## 9\. CI/CD: one push updates data, assistant, and visualizations

The automation goal is: a data change (nightly cron or manual dispatch) propagates all the way to the live site, the regenerated knowledge base, and the re-grounded assistant, in one ordered chain. Confirm what already exists under `.github/workflows/` and edit rather than duplicate.

### 9.1 Workflow A: data sync and self-propagation (`.github/workflows/redcap_sync.yml`)

```
name: REDCap Sync and Propagate
on:
  schedule: [{ cron: "0 8 * * *" }]   # 08:00 UTC daily
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11", cache: pip }
      - run: pip install -r requirements.txt
      - name: Pull REDCap, strip PHI, build payload (writes redcap_* keys)
        env:
          REDCAP_API_URL: ${{ secrets.REDCAP_API_URL }}
          REDCAP_API_KEY: ${{ secrets.REDCAP_API_KEY }}
          PARTICIPANT_ID_SALT: ${{ secrets.PARTICIPANT_ID_SALT }}
        run: |
          python redcap/api/redcap_pull.py
          python dashboard/pipelines/build_dashboard_data.py
      - name: Regenerate context skill from live structure (Buddy learns new features)
        env:
          REDCAP_API_URL: ${{ secrets.REDCAP_API_URL }}
          REDCAP_API_KEY: ${{ secrets.REDCAP_API_KEY }}
        run: |
          python dashboard/context_skill/extract_context.py --verify-redcap
          python dashboard/context_skill/extract_context.py --emit
      - name: Re-index the local assistant grounding
        run: python scripts/prepare_dashboard_assistant.py --reindex || true
      - name: Commit only if data changed (prevents infinite loop)
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add dashboard/data/dashboard_data.json dashboard/context_skill/references/tables/redcap.md
          git diff --cached --quiet || git commit -m "Auto: REDCap sync + context regen [skip ci]"
          git push || true
```

The push to `dashboard/data/**` triggers Workflow B. The `[skip ci]` tag stops the commit from re-triggering Workflow A. This is the whole propagation loop: data in, payload \+ knowledge base \+ assistant index regenerated, committed, deployed.

### 9.2 Workflow B: build and deploy (`.github/workflows/deploy-pages.yml`)

```
name: Deploy to Cloudflare Pages
on:
  push:
    branches: [main]
    paths: ["web/**", "dashboard/**", "functions/**", "config/**", "public/**"]
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: web/package-lock.json }
      - name: Generate TS constants from canonical YAML (symmetry guard)
        run: node scripts/gen_redcap_constants.mjs
      - name: Fail if constants drifted from YAML
        run: git diff --exit-code web/src/constants/redcapConfig.ts
      - run: cd web && npm ci && npm run build
      - name: Bundle Cloudflare Functions
        run: mkdir -p web/dist/functions && cp -r functions/* web/dist/functions/ 2>/dev/null || true
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: esd-lab-namo
          directory: web/dist
```

### 9.3 Real-time path (optional)

If USC enables a Data Entry Trigger on PID 5955, point it at a small endpoint that calls the GitHub `workflow_dispatch` REST API for `redcap_sync.yml`, so a saved record refreshes the site within minutes instead of waiting for the nightly cron. The repo already has `scripts/redcap_daily_sync.py` and `check_live_surfaces.py` to lean on. Contact [ORHSREDCap@mailbox.sc.edu](mailto:ORHSREDCap@mailbox.sc.edu) to enable DET.

### 9.4 What propagates automatically after this

| You do | Automatically updated |
| :---- | :---- |
| Edit `config/redcap_config.yml` and push | TS constants regenerate, parity test guards drift, site rebuilds |
| Nightly cron or manual dispatch | `dashboard_data.json` (data), `redcap.md` (knowledge base), assistant index, live charts, Buddy answers, freshness badge |
| REDCap record saved (with DET) | Same chain within minutes |

---

## 10\. Constraints and non-goals

**Hard constraints:**

- PHI never leaves the secure mount. Record IDs are HMAC-SHA256 hashed to `NANO-XXXXXXXX` before any JSON is written; the `phi_fields` list in the contract is dropped first. The committed `dashboard_data.json` must contain zero PHI. The repo already has a `phiScrub` test; extend it to cover the REDCap slice.  
- The token never reaches the browser and never enters a committed file. Only env var names appear in code. The browser proxy is read-only and write actions are refused.  
- `verify_ssl` is always true. Never disable certificate validation to "make it work."  
- The front-end event list, the Python list, the R list, the Zod enum, and the context skill all descend from `config/redcap_config.yml`. No hand-typed duplicates.  
- Stay within the assistant's 4096-token context window; cap REDCap fragments.

**Non-goals (out of scope here):**

- No participant-identifying detail in the public site or the assistant.  
- No new charting library or design system; reuse existing primitives and tokens.  
- No fine-tuning of the local model; grounding only.  
- No browser-initiated writes to REDCap; writes are server-side and audited.

---

## 11\. Success criteria and acceptance tests

The build is done when every check passes:

1. Connection: `python redcap/api/redcap_pull.py --dry-run` prints `Namit - NANO Study Surveys (PID 5955)`.  
2. Pipeline parity: Python and R builders produce byte-identical `redcap_*` keys on the same input (diff is empty).  
3. PHI scrub: a test asserts no `phi_fields` value appears anywhere in `dashboard_data.json`.  
4. Symmetry guard: `node scripts/gen_redcap_constants.mjs` then `git diff --exit-code web/src/constants/redcapConfig.ts` is clean; editing an event in the YAML and rebuilding changes the TS file.  
5. Context freshness: `python dashboard/context_skill/extract_context.py --verify-redcap` exits 0 and confirms 12 events and the `csbs_caregiver` 6/9/12/24m mapping.  
6. Proxy read-only: `POST /api/redcap {"content":"project"}` returns the title; `POST /api/redcap {"action":"import",...}` returns HTTP 403\.  
7. Assistant grounding: ask the Buddy "how many carry-forward anomalies right now?" and it answers from `redcap_visit_health` with a `redcap.*` citation, and "when was REDCap last synced?" returns `redcap_meta.generated_at`.  
8. Visualization: `/redcap` shows stacked completeness for 6/9/12/24m and a flagged-first visit-health table; `/public-insights` shows the REDCap tiles; both reflect the latest committed JSON.  
9. End to end: a manual `workflow_dispatch` of `redcap_sync.yml` updates the data, regenerates `redcap.md`, redeploys, and the smoke test `curl -sf https://esd-lab-namo.pages.dev/redcap` succeeds.

High-stakes verification: before merging, run the existing test suite (`web/src/test/*`, including `buddy.test.tsx`, `chatApi.test.ts`, `phiScrub.test.ts`, `darkModeSurfaceGuard.test.ts`) plus the new parity and PHI tests. Consider a second reviewer or a subagent pass focused solely on confirming no PHI and no token appears in any committed artifact.

---

## 12\. Edge cases and fallbacks

- REDCap unreachable in CI: keep the last good `dashboard_data.json`, set `redcap_meta.source = "synthetic-fallback"`, do not commit empty data, and alert. The site and Buddy both show the fallback state honestly.  
- De-identified export rights: if PHI fields you expect are silently absent, your token rights may be "De-Identified." Email [ORHSREDCap@mailbox.sc.edu](mailto:ORHSREDCap@mailbox.sc.edu) for "Full Data Set" export. Do not assume a parsing bug.  
- `visit_date` read at a non-visit event (consent, caregiver, sibling): treat as absent; never throw.  
- CSBS now extends to 24m: any 6/9/12-only assumption is stale. The R5 flag and the 24m column exist for this reason.  
- Large dictionary (3995 fields): pull only the fields the contract needs (`record_id`, `redcap_event_name`, `visit_date`, `csbs_caregiver_complete`, plus chosen `_complete` fields) to avoid USC server timeouts; chunk by record if needed.  
- Context window overflow: if flagged records exceed the cap, include the roll-up counts plus the top-N flagged and a "N more flagged" fragment.  
- Workflow loop: the auto-commit message must contain `[skip ci]`.

---

## 13\. Ordered execution checklist

Run top to bottom. Verify each before the next.

```
□ ls .github/workflows && ls functions          # see what exists before building
□ Update config/redcap_config.yml to the canonical contract (Section 4.1)
□ Local secrets: .env (REDCAP_API_KEY, PARTICIPANT_ID_SALT), .dev.vars (REDCAP_API_TOKEN); confirm both gitignored
□ python redcap/api/redcap_pull.py --dry-run    # expect PID 5955 title
□ Extend build_dashboard_data.py (+ .R) with the three REDCap builders (Section 5.2 / 5.3)
□ python dashboard/pipelines/build_dashboard_data.py  # writes redcap_* keys
□ Create functions/api/redcap.js (read-only proxy, Section 5.4)
□ Create scripts/gen_redcap_constants.mjs; run it; commit generated constants
□ Create web/src/api/redcapSchemas.ts + redcapClient.ts; add useRedcapData()
□ Extend web/src/routes/Redcap.tsx and PublicInsights.tsx (reuse existing charts)
□ Add REDCap section + freshness to local_chat_assistant.py; chips to Buddy/ChatDrawer
□ Rewrite references/tables/redcap.md; extend extract_context.py (--verify-redcap, --emit)
□ Wire/confirm .github/workflows redcap_sync.yml + deploy-pages.yml (Section 9)
□ GitHub Secrets: REDCAP_API_URL, REDCAP_API_KEY, PARTICIPANT_ID_SALT, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
□ Cloudflare Pages env: REDCAP_API_TOKEN, REDCAP_API_URL
□ Run web test suite + new parity/PHI tests; all green
□ Push; watch both workflows; curl https://esd-lab-namo.pages.dev/redcap
□ Ask the Buddy a REDCap question; confirm grounded answer + freshness
□ Vault or delete this master prompt file (it holds the token)
```

---

## 14\. Appendix

### A. Environment variables

| Variable | Lives in | Notes |
| :---- | :---- | :---- |
| `REDCAP_API_URL` | `.env`, `.dev.vars`, GitHub Secrets, Cloudflare env | `https://redcap.research.sc.edu/api/` |
| `REDCAP_API_KEY` | `.env`, GitHub Secrets | the token; Python side |
| `REDCAP_API_TOKEN` | `.dev.vars`, Cloudflare env | the token; Wrangler \+ proxy side |
| `PARTICIPANT_ID_SALT` | `.env`, GitHub Secrets | 64 hex chars; never change after production |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | Pages deploy |
| Never use a `VITE_`\-prefixed token variable | n/a | `VITE_` bundles into the browser |

### B. File map for this change (real paths)

```
config/redcap_config.yml                         EXTEND  canonical contract
scripts/gen_redcap_constants.mjs                 CREATE  YAML -> TS generator
functions/api/redcap.js                          CREATE  read-only proxy
dashboard/pipelines/build_dashboard_data.py      EXTEND  + 3 REDCap builders
dashboard/pipelines/build_dashboard_data.R       EXTEND  R parity
dashboard/assistant/local_chat_assistant.py      EXTEND  REDCap section + freshness
dashboard/context_skill/references/tables/redcap.md  REWRITE  real structure
dashboard/context_skill/extract_context.py       EXTEND  --verify-redcap, --emit
scripts/prepare_dashboard_assistant.py           EXTEND  --reindex
web/src/constants/redcapConfig.ts                GENERATED (do not hand-edit)
web/src/api/redcapSchemas.ts                      CREATE  Zod mirror
web/src/api/redcapClient.ts                       CREATE  proxy wrapper
web/src/routes/Redcap.tsx                         EXTEND  completeness + visit health
web/src/routes/PublicInsights.tsx                 EXTEND  REDCap insight tiles
web/src/components/shell/Buddy.tsx                EXTEND  REDCap chips
web/src/components/shell/ChatDrawer.tsx           EXTEND  REDCap chips + freshness
web/src/api/chatApi.ts                            EXTEND  freshness.redcap block
.github/workflows/redcap_sync.yml                 WIRE    sync + propagate
.github/workflows/deploy-pages.yml                WIRE    build + deploy
```

### C. Contacts and links

| Resource | Where |
| :---- | :---- |
| API token / export rights | [ORHSREDCap@mailbox.sc.edu](mailto:ORHSREDCap@mailbox.sc.edu) |
| REDCap login | [https://redcap.research.sc.edu](https://redcap.research.sc.edu) |
| Project setup (PID 5955\) | [https://redcap.research.sc.edu/redcap\_v16.0.18/ProjectSetup/index.php?pid=5955](https://redcap.research.sc.edu/redcap_v16.0.18/ProjectSetup/index.php?pid=5955) |
| Define events | [https://redcap.research.sc.edu/redcap\_v16.0.18/Design/define\_events.php?pid=5955](https://redcap.research.sc.edu/redcap_v16.0.18/Design/define_events.php?pid=5955) |
| Repo | [https://github.com/namo507/ESD-Lab-USC](https://github.com/namo507/ESD-Lab-USC) |
| Live | [https://esd-lab-namo.pages.dev/](https://esd-lab-namo.pages.dev/) and /redcap |

---

*Master prompt v2, verified against the live PID 5955 structure and the actual repository tree on 2026-06-24. ESD Lab USC, Namit Shrivastava ([namit507@sc.edu](mailto:namit507@sc.edu)). This file contains the API token: do not commit it; vault or delete after setup.*  
