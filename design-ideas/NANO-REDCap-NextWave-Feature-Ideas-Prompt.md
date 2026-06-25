# MASTER PROMPT: REDCap Next-Wave Features (v3, net-new only)

## NANO Study · PID 5955 · github.com/namo507/ESD-Lab-USC · the clinical-intelligence and unused-API layer

**This is the third prompt in the series and it deliberately repeats nothing.** v2 built the data spine. The ideas prompt built audience dashboards, three control tiers, and the three-runtime sync. Both are now implemented and live. This prompt adds only features that do not yet exist: clinical instrument intelligence, deeper data integrity, scheduling and temporal analytics, respondent burden, the REDCap API surfaces still unused, predictive and AI-native tools, and stronger public privacy. **Safe to commit:** token-free, PHI-free. Suggested home `docs/REDCAP_NEXTWAVE_IDEAS.md`. **Verified on 2026-06-25.**

---

## 1\. Current status (verified, do not rebuild)

I rechecked the live site and the repository that produces it. The public pages are client-rendered React, so I confirmed implementation from the deployed build metadata (`esd-build-sha 506756bd`, deploy stamp `2026-06-25T01:40Z`, live API served from a `cloudflared` tunnel origin) and from the repository source at HEAD `86e411a`, whose recent history includes "Implement REDCap visit health monitor", "Implement REDCap dashboard sync layer", "dashboard ideas implemented", "Integrate REDCap dashboard automation", and "Integrate clinical local assistant model".

Already shipped, so this prompt will not propose any of these again:

| Area | Already live |
| :---- | :---- |
| Routes | `Redcap.tsx`, `ExecutiveMode.tsx`, `PublicInsights.tsx`, `PipelineHealth.tsx`, `EcgQuality.tsx` |
| Data keys | `redcap_meta`, `redcap_completion_stats`, `redcap_visit_health`, `redcap_audit` (summary, queries\_by\_event, recent\_activity), `redcap_trackers` (enrollment, instrument\_completeness, queue\_funnel, thresholds), `redcap_timeline`, `redcap_ops` (freshness, runtime\_parity, run\_ledger, controls\_snapshot) |
| Coordinator | Visit-health monitor, carry-forward anomaly board (R1 to R5), CSBS completeness, swimlane timeline, CSV export, live "Refresh" and "Sync now" |
| PI and public | Executive mode, public insights, enrollment and queue trackers |
| Ops | Tri-runtime parity, run ledger, freshness, Tier-1 controls snapshot |
| Platform | Edge proxy `functions/api/redcap.js`, generated TS constants, assistant grounding with REDCap fast-paths, Docker, Helm, Cloudflare sync |

What is NOT yet used, which is where this prompt focuses:

- REDCap API surfaces untouched: the Logging API (`content=log`), Reports (`content=report`), File Repository (`content=fileRepository`), and Users and DAGs (`content=user`).  
- Clinical instrument scoring: the 56 instruments are tracked for completeness only, not interpreted. No score trajectories, no clinical cutoffs, no cross-instrument or family-level analysis exists.  
- Integrity beyond open queries: no nullity matrix, no double-entry diff UI, no response-quality or branching-logic checks.  
- Scheduling and timing: visits are shown, but on-time adherence, retention survival, and a forward lookahead do not exist.

---

## 2\. Objective

**Extend the live NANO dashboards with a second wave of REDCap features that interpret the data clinically, harden its integrity, model its timing, and light up the REDCap API surfaces still unused, while reusing the existing component library and the established `redcap_*` contract so the additions feel native.**

Constraints carried from the prior prompts (still binding): PHI never reaches the browser; the token stays server-side; reuse `components/{insights,charts,warm,pipeline,timeline,comparison,dyn,primitives}` and the `tokens.css` palette; every new payload key is produced identically by the Python and R builders and grounded by the assistant. Anything below that references a clinical score must verify the exact field name in the live metadata first and use REDCap's calculated score field when one exists, rather than assuming.

---

## 3\. Theme A: Clinical instrument intelligence

The single biggest gap. Today the dashboards count whether `csbs_caregiver` is complete; they never show what any instrument means. These ideas turn raw instruments into clinical signal. All are aggregate or hashed-record level, never identifying.

New payload key: `redcap_clinical`.

1. Maternal Mental Health Trajectory (EPDS). Plot Edinburgh Postnatal Depression Scale totals (`edinburgh_postnatal_depression_scale`) per caregiver across events, with shaded clinical bands (screen-positive at total \>= 10, higher-concern at \>= 13, and the self-harm item flagged separately). Reuse `components/insights/CdcStyleLine.tsx`. Surface a "screen-positive needing review" count on the coordinator board. This is genuinely actionable for an infant study where maternal depression shapes outcomes.  
2. Developmental Surveillance Grid (ASQ, MCDI, CSBS). For each child, a small-multiples grid of developmental domains: ASQ-3 24m and 36m domain scores in pass / monitor / refer zones, MCDI (`mcdi_words_gestures`, `mcdi_words_sentences`) vocabulary counts against age percentile ribbons, and a CSBS concern composite. Reuse `components/charts/TrajectoryChart.tsx` in a small-multiple layout. This is the developmental heart of the study made visible.  
3. Family Autism-Risk Constellation. NANO is an infant-sibling design, so risk is a family property. A radial overlay per family that places sibling SCQ (`scq_lifetime`, `scq_current_sibling`) and SRS, caregiver BAPQ (`bapq_caregiver_1/2`), SRS-adult, CAARS, and LSAS, and the infant's Autism Impact Measure and IBQ-R on one spider, so heritable load is legible at a glance. Reuse a radial built on the existing chart primitives; cross-link with `components/comparison`. Nothing like this exists and it is highly specific to this cohort.  
4. Cascade Explorer (temperament to outcome). The lab's framework is developmental cascades, so build the cascade: early temperament and motor and sensory signals (`infant_behavior_questionnaire_revised_*`, `early_motor_questionnaire_emq`, sensory profile) on the left flowing to later ASQ, Vineland, and SRS outcomes on the right, with edge thickness by correlation strength. Reuse `components/pipeline/PipelineSankey.tsx` or `routes/CascadeDag.tsx` styling. Aggregate and PHI-free.  
5. ADOS and Best-Estimate Diagnostic Flow. Distribution of ADOS modules administered (`ados_module_1/2/3`), `ados_score` bands, and clinical best-estimate classifications (`clinical_best_estimate_form`) at 24m and 36m, as a flow from screened to assessed to classified. Reuse `routes/AttritionFunnel.tsx` styling. Use REDCap calculated score fields where present.

---

## 4\. Theme B: Deeper data integrity

The shipped `redcap_audit` covers open queries. These go deeper into the data itself.

New payload key: `redcap_integrity`.

6. Nullity Matrix (moth-eaten map). A missingno-style matrix: forms on one axis, events on the other, cell darkness by missing-field fraction, so structural gaps in the 3995-field dictionary jump out. Reuse the heatmap pattern already used by `routes/ThermalHeatmap.tsx`. Add a per-instrument "expected vs present field" bar.  
7. Double-Entry Reconciliation Diff. The repo has `redcap/quality_control/double_entry_validation.py` but no UI. Render side-by-side first-entry vs second-entry mismatches with the differing fields highlighted and a per-instrument mismatch rate trend. Reuse `components/dyn/RouteDataTable.tsx` with a diff cell renderer.  
8. Response-Quality Sentinel. For long Likert instruments (SRS, BAPQ, CAARS), detect straight-lining (near-zero item variance) and implausibly fast completion using survey timestamps, and surface a quality score per submission. This protects construct validity and no current view touches it. Compute server-side; render as a `warm/MetricCard` with drill-in.  
9. Branching-Logic Integrity Check. Flag fields that carry a value although the project's branching logic should have hidden them, a classic source of silent contamination. Compute against the metadata branching expressions; show counts per instrument with examples (field names only, no values).  
10. Validation-Rule Violation Radar. Aggregate out-of-range and format violations per instrument into a radar so the worst offenders are obvious. Reuse a radar built on existing primitives.

---

## 5\. Theme C: Scheduling and temporal analytics

Visits are displayed; their timing is not analyzed. Events here are age-anchored (1m through 36m), which makes timing analysis especially meaningful, and REDCap scheduling is disabled, so the dashboard is the natural home for it.

New payload key: `redcap_schedule`.

11. Visit-Window Adherence Beeswarm. For each visit event, plot actual age-at-visit minus the protocol target age in days, as a beeswarm with the acceptable window shaded, so early and late drift is visible per event. This is a novel, clinically meaningful timing view. Reuse a swarm/scatter on existing chart primitives.  
12. Retention Survival Curve. A Kaplan-Meier-style curve of cohort retention across the 12 events, with withdrawals as censoring, split by cohort (for example enrollment quarter). Reuse `components/insights/CumulativeCurve.tsx` styling inverted. Answers "where do families drop off" precisely.  
13. Collection Calendar Heatmap. A GitHub-style calendar of daily data-collection volume, revealing seasonality, gaps, and crunch periods. Reuse `components/warm` tiles or a compact custom grid.  
14. Next-30-Days Visit Forecast. Compute upcoming visit windows from each record's prior `visit_date` plus the protocol cadence and list who is due, overdue, or approaching, since REDCap's own scheduling is off. A coordinator planning tool. Reuse `RouteDataTable.tsx` with urgency coloring.  
15. Data-Entry Lag Control Chart. Time from `visit_date` to form completion as an SPC control chart with control limits, so process drift in data entry is caught early. Reuse `TrajectoryChart.tsx` with control-limit bands.

---

## 6\. Theme D: Respondent and burden analytics

The study has two caregivers plus sibling respondents and a `questionnaires_to_send` queue. None of this respondent structure is visualized.

New payload key: `redcap_respondent`.

16. Caregiver Burden Meter. From the `questionnaires_to_send` `send_*` flags, show questionnaires assigned vs started vs completed per caregiver\_1 and caregiver\_2, with a fatigue indicator when assignment outruns completion. Reuse `warm/MetricCard` and a small funnel. Helps balance respondent load.  
17. Multi-Respondent Concordance. Where caregiver 1 and caregiver 2 answer parallel instruments (BAPQ, SRS-adult, LSAS, CAARS), plot their agreement with a Bland-Altman or scatter and a concordance coefficient, surfacing systematic reporter differences. Reuse `components/comparison/MirroredBarChart.tsx` or a scatter primitive. Aggregate only.

---

## 7\. Theme E: REDCap API surfaces still unused

These wire real REDCap endpoints the project has never called, each unlocking a feature class.

New payload key: `redcap_platform`.

18. Audit-Trail River (Logging API, `content=log`). Stream REDCap's own change log (who changed what field, when) into a filterable activity river, far richer than the current `recent_activity` snapshot. Pull server-side on a schedule, hash usernames if needed for public views, and render with `components/timeline`. Powerful for monitoring and for reconstructing how a carry-forward error happened.  
19. Embedded REDCap Reports (`content=report`). Let the PI define reports in REDCap and surface them live in the dashboard by report id, so leadership sees their own saved views without leaving the site. Render through the existing virtual-table grid. Read-only via the audited server, never the edge.  
20. File Repository Browser (`content=fileRepository`). Surface non-PHI documents from REDCap's file repository (protocols, blank forms, data dictionaries) as a browsable, downloadable list, so the dashboard becomes the single front door. Strictly exclude any participant-uploaded PHI by folder allowlist.  
21. Coverage and Coordinator Activity (`content=user`). Show which users and Data Access Groups are entering data, last-active times, and role coverage gaps, so the team can see staffing and stale accounts. Pull server-side; render on `PipelineHealth.tsx`. Display roles and activity, never credentials.

---

## 8\. Theme F: Predictive and AI-native tools

The repo already ships ML and explainability routes (`ShapExplorer`, `ModelLeaderboard`, `ModelConfidenceTerrain`) and a grounded assistant with fast-paths. These extend that investment to REDCap without repeating the existing grounding.

New payload key: `redcap_predictive`.

22. Attrition and Incompletion Early-Warning. Train a light model on engagement and timing features (visit lag, missed visits, queue backlog, EPDS) to score each active record's risk of going incomplete or withdrawing, and surface the drivers through the existing SHAP view (`routes/ShapExplorer.tsx`). A genuinely forward-looking coordinator tool. Keep the model in the existing model pipeline; expose only hashed-record risk scores.  
23. Natural-Language Table Query. Let a coordinator type "9-month CSBS incomplete in the last 30 days" and have the assistant compose the filter against the existing `query_virtual_table` layer, returning a live grid. Builds on the assistant and the virtual-table engine without duplicating either.  
24. Auto-Generated Weekly Study Memo. Have the assistant write a weekly status narrative from the `redcap_*` keys and hand it to the existing `routes/PresentationMaker.tsx` to produce a shareable deck or one-pager. Turns the data into a leadership artifact automatically.  
25. Carry-Forward Root-Cause Explainer. For any flagged record, have the assistant explain in plain language which event sequence and which form actions most likely produced the anomaly, citing the Logging API trail from idea 18\. Pairs prediction with the integrity work.

---

## 9\. Theme G: Stronger public privacy

The public surface already has aggregate tiles. These let it show more while proving it protects participants.

26. Differential-Privacy Count Toggle. Offer a public mode that adds calibrated noise to small aggregates with a visible epsilon, so the showcase can present finer cuts without re-identification risk. Pairs with the existing small-cell suppression.  
27. Milestone Constellation. A calm radial of aggregate milestone attainment across the cohort for a lobby or grant figure, aggregate-only and suppression-safe. Reuse `components/warm` motion primitives.

---

## 10\. Additive contract for the new keys

Keep the established pattern: the only human-edited sources stay `config/redcap_config.yml` and `config/dashboard_controls.json`; the Python and R builders emit these new keys identically; the assistant grounds on them automatically; the new routes read them through one fetch hook.

```
{
  // existing seven keys stay untouched
  "redcap_clinical":   { "epds_trajectory": [], "developmental_grid": [], "family_risk": [], "cascade_edges": [], "ados_flow": [] },
  "redcap_integrity":  { "nullity_matrix": [], "double_entry_diffs": [], "response_quality": [], "branching_violations": [], "validation_radar": [] },
  "redcap_schedule":   { "window_adherence": [], "retention_survival": [], "collection_calendar": [], "upcoming_visits": [], "entry_lag": [] },
  "redcap_respondent": { "caregiver_burden": [], "respondent_concordance": [] },
  "redcap_platform":   { "audit_log": [], "reports": [], "file_repository": [], "users": [] },
  "redcap_predictive": { "attrition_risk": [], "nl_query_enabled": true },
  "clinical_cutoffs":  { "epds_positive": 10, "epds_high": 13 }   // in config/dashboard_controls.json, tunable
}
```

Clinical thresholds (EPDS cutoffs, ASQ zones, window tolerances) become Tier-1 knobs in `config/dashboard_controls.json`, so a clinician can tune them through the existing control path and every clinical view and the assistant update together.

---

## 11\. Success criteria

1. No duplication: a reviewer confirms none of ideas 1 to 27 restate a shipped feature from Section 1\.  
2. Grounded: every clinical idea references a verified instrument and uses REDCap's calculated score field or item-level fields confirmed in metadata, with a `TODO(verify)` where a field is unconfirmed.  
3. Native feel: new routes and tiles reuse existing components and tokens, pass the dark-mode contrast guard, and read through the single `useRedcapData()`\-style hook.  
4. Privacy: clinical and respondent views are aggregate or hashed-record only; public additions pass small-cell suppression; the File Repository and Users features exclude PHI and credentials.  
5. Parity and grounding: the new keys are produced by both builders, the parity hash still matches across runtimes, and the assistant answers a question from at least one new key (for example "how many mothers are EPDS screen-positive?").

---

## 12\. Suggested build order

```
□ Start with Theme A idea 1 (EPDS trajectory): highest clinical value, single instrument, fast win
□ Then Theme C ideas 11 and 14 (window adherence + forecast): coordinator value from data already pulled
□ Then Theme E idea 18 (Logging API river): unlocks idea 25 and richer monitoring
□ Then Theme B ideas 6 and 7 (nullity matrix + double-entry diff): integrity backbone
□ Then Theme F idea 22 (attrition early-warning) reusing ShapExplorer
□ Layer remaining clinical (2 to 5), respondent (16 to 17), platform (19 to 21), public (26 to 27)
□ Each: add the key to both builders, add the route/tile, extend the assistant section, add tests, verify parity
```

---

*Third in the series, net-new only. Verified against the deployed build and the repository on 2026-06-25. Token-free and PHI-free: safe to commit at `docs/`. ESD Lab USC, Namit Shrivastava ([namit507@sc.edu](mailto:namit507@sc.edu)).*  
