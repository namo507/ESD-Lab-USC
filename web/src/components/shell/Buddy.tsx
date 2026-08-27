import { useEffect, useRef, useState } from "react";
import { HELP_INSIGHTS } from "@/data/helpContent";
import { startNanoTour } from "@/components/help/tourEvents";
import styles from "./Buddy.module.css";

export interface InsightData {
  term: string;
  body: string;
}

export const INSIGHTS: Record<string, InsightData> = {
  ...HELP_INSIGHTS,
  "kpi-enroll": { term: "Enrollment", body: "This tile reads the current aggregate NANO enrollment from the configured survey-authority REDCap project and compares it with the study target. It never exposes participant rows or identifiers." },
  "kpi-evals": { term: "Evaluations", body: "This tile summarizes study visits that still need HDA labeling, adjudication, or downstream scoring before the analysis pipeline is fully caught up." },
  "kpi-epochs": { term: "Epochs", body: "Each epoch is a 5-second ECG window. The pipeline counts them after preprocessing and QA because they are the unit that drives both HRV features and HDA labels." },
  "kpi-redcap": { term: "REDCap Health", body: "REDCap health reports freshness and project coverage from the server-generated, aggregate-only portfolio snapshot. Browser access to raw REDCap records is permanently disabled." },
  "kpi-publications": { term: "Publications", body: "The publications tile counts locally indexed PubMed, ORCID, Crossref, and manual records in the dashboard database, with the last sync timestamp kept separate from participant data." },
  "data-explorer-table": { term: "Data Explorer", body: "This SQL-style surface switches between de-identified participant, run, pipeline-stage, and REDCap-event tables. Column filters and CSV export operate on the visible filtered rows only." },
  "publications-card": { term: "Publication card", body: "Publication cards combine normalized metadata, deterministic research tags, citation counts, APA copy, and DOI/PubMed links without touching NANO participant identifiers." },
  "publications-filters": { term: "Publication filters", body: "Year, tag, type, and search filters narrow the indexed literature set. Multiple tags use OR logic so broad topical scans stay quick." },
  "publication-detail": { term: "Publication detail", body: "The detail page exposes full abstract, authors, MeSH terms, auto-tags, keywords, APA citation, and citation-count context. Manual tag edits remain admin-gated." },
  "changelog-filters": { term: "Change filters", body: "Changelog filters narrow the de-identified audit trail by entity type, action, dates, actor, notes, and version tag." },
  "snapshots-panel": { term: "Dataset snapshots", body: "Snapshots are named checkpoints with row counts and checksums for reproducible analysis handoffs. Exports remain de-identified." },
  "landing-overview": { term: "NANO Study", body: "This landing route is now aligned to the operator shell: a warm clinical palette, the same data language, and the same hover-aware Buddy guidance across every major section." },
  "landing-study": { term: "Study design", body: "NANO follows very preterm, autism-sibling, and term-born infants longitudinally so physiology, attention, and later outcomes can be interpreted together rather than as isolated visits." },
  "landing-waveform": { term: "Live ECG", body: "The hero ribbon echoes the same operational story as the dashboard: Actiheart ECG is the physiological backbone that feeds HRV, HDA, and downstream modeling." },
  "landing-metrics": { term: "Lab pulse", body: "Enrollment and REDCap health come from the current aggregate portfolio feed. Pipeline and model panels are labeled separately when they use operational or pilot snapshots." },
  "landing-rmssd": { term: "RMSSD", body: "RMSSD is a vagal-tone summary derived from accepted ECG windows. On the landing page it anchors the clinical narrative before users drill into results." },
  "landing-runs": { term: "Queued runs", body: "Queued runs reflect pipeline work waiting on compute or review. It is the quickest signal that fresh study data is moving through the system right now." },
  "landing-assistant-context": { term: "Assistant context", body: "These HDA-labeled windows and study summaries are the same grounding context the in-page assistant uses when it explains cohorts, signals, and model behavior." },
  "landing-aims": { term: "Specific aims", body: "The three aims connect early autonomic regulation, observed behavior, and later ASD symptom prediction into one longitudinal infant-development story." },
  "landing-aim-01": { term: "Aim 01", body: "Aim 01 asks how heart-defined attention matures in the first months of life and whether ASIB or VPT infants diverge from typical early autonomic regulation." },
  "landing-aim-02": { term: "Aim 02", body: "Aim 02 links physiology to interactive behavior, testing whether attention-related autonomic patterns track what infants do during later study visits." },
  "landing-aim-03": { term: "Aim 03", body: "Aim 03 turns the early physiology and HDA signatures into prediction features for later ASD symptom likelihood at age 3." },
  "landing-groups": { term: "Cohorts", body: "ASIB, VPT, and TD are not just labels here; they are the core study arms that structure recruitment, comparison, and every longitudinal analysis surface." },
  "landing-architecture": { term: "Data architecture", body: "This section compresses the same study stack used in operations: device capture, REDCap forms, preprocessing, feature exports, and model-ready de-identified outputs." },
  "landing-arch-devices": { term: "Edge capture", body: "Actiheart ECG, eye tracking, and visit context start the pipeline. If capture quality is weak here, everything downstream gets noisier." },
  "landing-arch-capture": { term: "REDCap capture", body: "REDCap carries the visit metadata, forms, and versioned study structure that lets physiology be interpreted in the right participant and visit context." },
  "landing-arch-compute": { term: "SQI and HDA", body: "This layer is where ECG windows are cleaned, reviewed, and converted into quality-controlled attention labels suitable for science." },
  "landing-arch-features": { term: "Parquet outputs", body: "Long-form tables and parquet exports standardize the data so analysts, dashboards, and models all read from the same de-identified substrate." },
  "landing-arch-models": { term: "Models", body: "The modeling layer adds trajectories, attribution, and prediction, but only after upstream capture and QA have made the physiology defensible." },
  "landing-arch-panel": { term: "Active layer", body: "The detail panel explains the currently selected architecture layer so users can move from study narrative into the real operational substrate without leaving the page." },
  "landing-qa-watch": { term: "Agentic QA", body: "The watchlist summarizes what the pipeline currently needs human attention for, which is the same practical stance the operator surfaces take on data quality." },
  "landing-flow": { term: "Participant flow", body: "Recent participant flow keeps the public story grounded in real infant visits, showing which cohort, visit window, and site are active in the current feed." },
  "landing-cohort": { term: "Cohort table", body: "This table is the public-facing cohort snapshot: every visible infant row is a de-identified join of study arm, visit timing, site context, and QA status." },
  "landing-rmssd-chart": { term: "Trajectory plot", body: "The RMSSD trajectories summarize how vagal-tone trends differ by cohort across time, which is one of the core physiological narratives in the study." },
  "landing-hda-chart": { term: "HDA distribution", body: "This composition view breaks each cohort into orienting, sustained attention, inattention, and termination so group-level attentional signatures are visible at a glance." },
  "landing-model-card": { term: "Model card", body: "The model card keeps the landing honest: calibrated metrics, not just a headline score, and a clear bridge into the deeper results route." },
  "landing-studio-inputs": { term: "Model studio", body: "These sliders are an explanatory sandbox. They help visitors see how infant-level features can move the model before they enter the denser analytics views." },
  "landing-studio-gauge": { term: "Risk gauge", body: "The gauge is illustrative rather than diagnostic. It demonstrates feature sensitivity and calibration language without pretending to be a clinical decision tool." },
  "landing-assistant": { term: "ESD Buddy", body: "Buddy stays visible across the landing so users can hover for context, then open the assistant to turn any section into a natural-language explanation." },
  "assistant-model-clinical": { term: "Assistant providers", body: "ESD Buddy answers through a backend-routed provider chain: Gemini first for speed, NVIDIA Nemotron next, then a local Docker model that needs no network. The browser never receives provider credentials or calls a model endpoint directly." },
  "assistant-model-fallback": { term: "Assistant fallback", body: "If a provider is busy or unavailable, the backend moves to the next tier in the chain automatically. When every tier is down the dashboard stays usable and switches to a limited, de-identified fallback instead of exposing provider errors." },
  "lab-ops-priority": { term: "Nano-first operations", body: "The operations panel keeps Nano grant data and lab process mapping as the current priority while Nico remains visible as a staged secondary lane." },
  "lab-ops-workflow": { term: "Workflow rollout", body: "The four-phase plan starts with observation, then REDCap/process standardization, then pilot reporting, then Nico and future-grant integration." },
  "lab-ops-phase": { term: "Workflow phase", body: "Each phase lists the study focus, expected tasks, outputs, and owners so staff can see what is active without implying that every future feature is ready now." },
  "lab-ops-roles": { term: "Role handoffs", body: "Coordinator, graduate-student, undergraduate, and supervisor responsibilities are separated so scheduling, scoring, coding, and approval work do not blur together." },
  "lab-ops-metrics": { term: "Aligned metrics", body: "The metric draft separates operational indicators such as REDCap freshness and coding queue age from manuscript-oriented research outputs." },
  "lab-ops-surface-status": { term: "Dashboard status", body: "This inventory summarizes what the website already shows across Overview, REDCap, Participants, Study Analytics, and Assistant surfaces, plus each area's next operational need." },
  "lab-reporting-management": { term: "Reporting management", body: "The reporting layer starts with actionable, next-month decisions: demographic availability, participant projections, budget-ready aggregates, and agreed priority data sets." },
  "lab-reporting-review": { term: "Reporting review queue", body: "Each review item separates the source system, useful breakdowns, current readiness, and next action before the lab commits to a formal report." },
  "lab-priority-datasets": { term: "Priority data sets", body: "The priority list names owner, source system, pull-speed unknowns, and report use so the team can agree what is worth standardizing first." },
  "lab-systems-audit": { term: "Systems audit", body: "The audit captures staff tools, responsibilities, storage locations, duplicated tracking, and how data moves into dashboard or reporting decisions." },
  "lab-budget-reporting": { term: "Budget reporting", body: "Budget-facing work should start from prepared aggregate inputs such as enrollment, visit volume, queue effort, and coverage, not manual deep number crunching." },
  "lab-external-collabs": { term: "External collaborations", body: "Prisma, CAN, and community advisory resources are operationally relevant, but their touchpoints need a clear handoff before dashboard metrics depend on them." },
  "lab-website-integration": { term: "Website integration", body: "The public ESD Lab website is useful for mission, recruitment, team, and contact context, but it is not integrated with internal REDCap or participant tracking." },
  "lab-next-month-reporting": { term: "Next-month reporting", body: "These candidates are the near-term operating metrics to define before building polished reports: pull readiness, due families, reconciliation burden, and data-set alignment." },
  "lab-ops-family": { term: "Family-facing guardrail", body: "Families currently receive text updates, on-site assessments, and individual feedback on request. Family-facing dashboards remain exploratory until supervisor and governance review." },
  "landing-reading": { term: "Reading list", body: "These papers and directions frame where the lab's physiology, behavior, and developmental modeling work connects to the broader literature." },
  "redcap-forms": { term: "Forms tracked", body: "These are the versioned REDCap instruments the dashboard mirrors. Field-map changes here affect every downstream export and quality check." },
  "redcap-records": { term: "Records", body: "This count reflects records pulled from or pushed back to REDCap in the last 24 hours through the secure study integration." },
  "redcap-warnings": { term: "Warnings", body: "Warnings indicate records that need human review, usually because a field is missing or a value failed validation but the sync could still continue." },
  "redcap-failures": { term: "Failures", body: "Failures are sync jobs that could not complete, often because authentication expired or a required form payload was malformed." },
  "redcap-completeness-matrix": { term: "Completeness matrix", body: "The REDCap matrix scores de-identified NANO IDs against NDA-required instruments, then opens a source-detail drawer without exposing PHI." },
  "redcap-workflow-states": { term: "Workflow states", body: "Completeness now tracks Complete, Due, Missing, Did Not Qualify, and Other so enrollment outcomes and form routing decisions are not hidden in blank cells." },
  "redcap-visit-health": { term: "Visit Health Monitor", body: "The Visit Health Monitor cross-checks CSBS caregiver completion across 6m, 9m, 12m, and 24m REDCap events and emits R1-R5 carry-forward anomaly codes from the canonical REDCap contract." },
  "redcap-anomaly-banner": { term: "Carry-forward alert", body: "This banner flags de-identified records whose earlier CSBS state conflicts with a later visit date or completion state, including the 24m R5 extension." },
  "redcap-visit-grid": { term: "Visit status grid", body: "Each row shows one de-identified record's CSBS completion status across all four carry-forward timepoints. Anomaly-flagged records sort to the top with their R-code badges." },
  "redcap-visit-chart": { term: "Completion chart", body: "The stacked bar chart groups participants by completion state at each timepoint. Hover for the record IDs behind each bar segment." },
  "redcap-visit-entry": { term: "Visit date source", body: "Visit dates are read from the REDCap visit_occurred.visit_date anchor at configured visit events. Browser REDCap writes are disabled; source corrections run through audited server-side scripts." },
  "redcap-missing-data": { term: "Missing data codes", body: "The SKIP code distinguishes intentionally skipped visits from missing data caused by errors. The coverage metric includes skips in the denominator so the team can assess true data completeness." },
  "redcap-visit-drawer": { term: "Visit detail", body: "The detail drawer shows one de-identified record's four-timepoint timeline with survey timestamps and R-code risk explanations." },
  "redcap-coverage-metric": { term: "Data coverage", body: "Coverage = (Complete + Skipped) / Total expected. This separates data the study intentionally does not have from data missing due to workflow errors." },
  "redcap-action-strip": { term: "Open actions", body: "The coordinator strip counts active carry-forward flags, visit-date gaps, heatwall cells below the current threshold, and the event furthest behind target from the shared REDCap payload." },
  "redcap-whatif-controls": { term: "What-if controls", body: "This threshold preview runs only in the browser. It recolors the current view without writing controls, calling REDCap, or changing the committed payload." },
  "redcap-anomaly-board": { term: "Anomaly board", body: "The board separates active R1/R2/R5 risks from historical R3/R4 shifts and cleared records so coordinators can triage the carry-forward queue." },
  "redcap-heatwall": { term: "Completeness heatwall", body: "The heatwall reads redcap_trackers.instrument_completeness. Each cell uses the same Tier-1 warning threshold as the PI scorecard and assistant." },
  "redcap-swimlane": { term: "Visit swimlane", body: "The swimlane timeline reads redcap_timeline and shows de-identified REDCap events across 6m, 9m, 12m, and 24m without exposing PHI." },
  "redcap-runtime-parity": { term: "Runtime parity", body: "Pages, Docker, and K8s each report a REDCap payload hash. Matching hashes mean the live dashboard surfaces are serving the same contract." },
  "redcap-ops-freshness": { term: "Ops freshness", body: "Freshness comes from redcap_ops.freshness and is also exposed to Ask AI, so stale REDCap data is visible in both the dashboard and assistant." },
  "redcap-controls": { term: "Tier-1 controls", body: "Tier-1 controls live in config/dashboard_controls.json. Rebuilds propagate threshold, sync, assistant, and feature-flag changes to every runtime." },
  "redcap-pipeline-dag": { term: "Sync DAG", body: "The REDCap sync DAG follows the production fan-out: pull, scrub, build, context regeneration, assistant reindex, and deploy." },
  "redcap-nextwave": { term: "Next-Wave REDCap", body: "This tab reads the additive v3 REDCap payload: clinical scores, integrity sentinels, schedule forecasts, platform API surfaces, respondent burden, predictive risk, and public privacy controls." },
  "redcap-epds-trajectory": { term: "EPDS trajectory", body: "EPDS totals use verified metadata fields when present. Screen-positive and high-concern counts follow the Tier-1 clinical cutoffs in dashboard_controls.json." },
  "redcap-development-grid": { term: "Developmental grid", body: "ASQ, CSBS, Bayley, and M-CHAT domains are aggregated by visit and interpreted with monitor or refer zones only after the field exists in metadata." },
  "redcap-family-risk": { term: "Family risk constellation", body: "The constellation keeps autism-risk instruments aggregate-only. Missing family instruments are marked for metadata verification rather than treated as real fields." },
  "redcap-cascade-explorer": { term: "Cascade explorer", body: "Cascade edges summarize aggregate correlations from early temperament, physiology, or attention features to later developmental outcomes. Edge weight is association, not causality." },
  "redcap-window-adherence": { term: "Visit-window adherence", body: "The beeswarm plots age-at-visit minus protocol target age in days, using non-PHI age offsets and the shared visit-window control." },
  "redcap-visit-forecast": { term: "Visit forecast", body: "The forecast lists hashed records with visit windows due, overdue, or approaching in the next 30 days so coordinators can plan without exposing dates of birth or contact data." },
  "redcap-nullity-matrix": { term: "Nullity matrix", body: "The matrix compares expected metadata fields with present non-PHI fields by instrument and event. Darker cells mean more missingness." },
  "redcap-integrity-diff": { term: "Double-entry diff", body: "Double-entry reconciliation shows hashed records and field names only. Values are intentionally summarized so the browser never becomes a PHI review tool." },
  "redcap-platform-audit": { term: "Audit-trail river", body: "The audit river is designed for server-side REDCap Logging API pulls. Usernames are hashed and only de-identified record references reach the dashboard." },
  "redcap-caregiver-burden": { term: "Caregiver burden", body: "Caregiver burden compares assigned, started, and completed questionnaire work across respondents to spot fatigue before follow-up queues grow." },
  "redcap-predictive-risk": { term: "Attrition risk", body: "The early-warning model uses engagement, timing, queue, and clinical aggregate signals. It exposes hashed risk scores and drivers, not diagnostic labels." },
  "redcap-public-privacy": { term: "Public privacy", body: "Public mode combines small-cell suppression with a differential-privacy count toggle and visible epsilon so finer aggregate views stay safer." },
  "redcap-milestone-constellation": { term: "Milestone constellation", body: "The milestone constellation is aggregate-only and summarizes developmental domain attainment for public or grant-facing views without row-level clinical detail." },
  "participant-id-legend": { term: "Participant ID legend", body: "The operations code makes study role visible: NANO uses the 5-series, NICO and ANONICO use the 9-series, and DUAL codes keep a linking ID for cross-study form review." },
  "participant-form-policy": { term: "Dual form policy", body: "Dual-enrolled participants default to one master AIH/EH unless a backend pull requires duplicate study-specific forms. Duplicate forms stay connected with the linking ID." },
  "matlab-bridge": { term: "MATLAB bridge", body: "This route tracks the de-identified Parquet handoff from secure MATLAB processing into the Python dashboard stack so dense physiology can be merged without exposing raw signals in the web layer." },
  "matlab-files": { term: "Parquet files", body: "These files are the handoff contract from MATLAB into the dashboard. Each one represents a derived feature stream that can be joined downstream without shipping raw ECG outside the secure compute path." },
  "matlab-rows": { term: "Rows merged", body: "Rows merged estimates how much MATLAB-derived physiology is already landing in the shared analysis dataset. A sudden drop usually means the export step stalled or the secure mount went missing." },
  "matlab-qa": { term: "QA pass", body: "QA pass average summarizes how often exported windows or feature families are clearing validation. If this drifts downward, the issue is usually upstream signal quality rather than the dashboard itself." },
  "matlab-scripts": { term: "Scripts ok", body: "This tile tracks whether the MATLAB jobs that build HRV, temperature, and HDA outputs have run cleanly in the last hour. It is the quickest way to spot a broken bridge before merges fall behind." },
  "matlab-inventory": { term: "Parquet inventory", body: "Inventory is the merge-ready view of the MATLAB outputs. File counts, feature family tags, row totals, and QA percentages tell you whether the downstream Python join has enough clean material to proceed." },
  "matlab-script-panel": { term: "Script panel", body: "This panel is the operational heartbeat for the bridge: which MATLAB jobs ran, how long they took, which feature family they touched, and whether an operator needs to investigate before the next refresh." },
  "matlab-throughput": { term: "Throughput", body: "Throughput shows when MATLAB is actually writing fresh rows into the interim handoff folder. Flat lines usually mean the secure source is idle, offline, or waiting on an upstream clinic batch to finish." },
  "matlab-options": { term: "Integration modes", body: "The three integration modes trade off latency, coupling, and operational safety. File handoff is the default because it keeps the website isolated from the secure MATLAB runtime while still feeding the analytics stack." },
  "matlab-option-file": { term: "Parquet handoff", body: "File-based handoff is the recommended path because it is low-coupling, auditable, and easiest to harden. MATLAB writes de-identified tables, and Python picks them up on the next scheduled merge." },
  "matlab-option-engine": { term: "MATLAB Engine", body: "The Engine path reduces latency when Python needs MATLAB functions directly, but it couples both runtimes tightly and raises the operational burden compared with the file-based bridge." },
  "matlab-option-rest": { term: "REST adapter", body: "A REST adapter keeps process boundaries clean, but it adds another service to secure and monitor. It is usually reserved for click-time inference or remote orchestration rather than the routine batch bridge." },
  "matlab-ask-buddy": { term: "Ask ESD Buddy", body: "This footer CTA opens the assistant with a MATLAB-specific seed prompt so operators can jump from hover context into a runbook-style explanation of the bridge, exports, and recovery steps." },
  "stage-ingest": { term: "Ingest", body: "Raw Actiheart ECG and REDCap metadata arrive here first. File naming, visit manifests, and source completeness are validated before processing continues." },
  "stage-preprocess": { term: "Preprocess", body: "This stage filters the ECG, detects R-peaks, extracts inter-beat intervals, and removes windows with too many ectopic beats or heavy noise." },
  "stage-qa": { term: "Window QA", body: "Signal quality is scored per epoch so borderline windows can be reviewed before HRV and HDA outputs are trusted downstream." },
  "stage-hrv": { term: "HRV", body: "Time- and frequency-domain features such as RMSSD, SDNN, pNN50, LF, and HF are computed once the ECG windows are accepted." },
  "stage-hda": { term: "HDA", body: "Heart-rate Defined Attention labels are assigned here, separating orienting, sustained attention, inattention, and termination phases." },
  "stage-merge": { term: "Merge", body: "The final merge joins processed physiology with visit metadata and writes de-identified outputs for downstream modeling and reporting." },
  "pipeline-svg": { term: "Pipeline", body: "This animated DAG shows the six-stage flow from ingest to de-identified export. Active edges pulse when work is moving between stages." },
  "pm-overview": { term: "Presentation Maker", body: "Turns one concept into a calm, minimal slide deck using the same backend-routed assistant as ESD Buddy. The deck plan is generated server-side; the PowerPoint file is built and downloaded entirely in your browser." },
  "pm-status": { term: "Assistant status", body: "Presentation generation uses the same backend-routed provider chain as ESD Buddy. Ready, degraded, and limited fallback states are shown without exposing credentials, endpoints, or reasoning traces." },
  "pm-composer": { term: "Concept composer", body: "Describe what you want explained, then nudge a few defaults: audience level, slide count, and whether to include an analogy or a worked example. Good defaults beat many options." },
  "pm-deck": { term: "Deck preview", body: "Each card is one slide in the structured plan: a title slide, a why-this-matters slide, two to four concept slides, optional analogy or example, and a recap. Lab-grounded concepts carry citations; general ones are labeled as such." },
  "pm-actions": { term: "Export & follow-up", body: "Download builds a real 16:9 .pptx with simple shapes and dividers, readable in PowerPoint, Keynote, and Google Slides. Ask ESD Buddy seeds the assistant with this deck's summary for a follow-up." },
  "dyn-metric-chip": { term: "DYN metric", body: "Dynamics & Dyads metrics are computed from de-identified dashboard endpoint data. Values marked with the help badge should be verified against primary sources before being quoted as literature facts." },
  "dyn-discovery": { term: "Dynamics & Dyads", body: "This Overview section links to the V2 relationship-over-time surfaces: dyadic physiology, gaze, phase dynamics, transitions, longitudinal synthesis, and decision support." },
  "dyn-discovery-card": { term: "DYN route", body: "Each card opens a feature-flagged Dynamics & Dyads route and uses the same de-identified v2 API layer as the rest of the dashboard." },
  "dyn-coreg-synchrony": { term: "Synchrony index", body: "Synchrony is the average peak windowed cross-correlation between caregiver and infant streams. Higher values indicate tighter dyadic coupling in the selected signal." },
  "dyn-coreg-lag": { term: "Lead-lag", body: "Signed lead-lag is the lag where coupling peaks. Positive values are shown as caregiver-leading-infant regulation; negative values suggest infant-leading dynamics." },
  "dyn-coreg-stability": { term: "Coupling stability", body: "Coupling stability tracks how much the peak lag jitters across the session. Larger variance means the dyadic timing relationship is less stable." },
  "dyn-coreg-recovery": { term: "Recovery concordance", body: "Recovery concordance summarizes how closely caregiver physiology tracks infant return toward baseline after an arousal spike." },
  "multimodal-sync": { term: "Multimodal Synchrony", body: "Gold windows mark the overlap of elevated rolling RSA, sustained HDA, and caregiver-face gaze. Treat them as review candidates, not diagnostic labels." },
  "dyn-phase-occupancy": { term: "Adaptive occupancy", body: "Adaptive occupancy is the share of samples inside the moderate-arousal, engaged-attention region of the phase portrait." },
  "dyn-phase-recovery": { term: "Recovery time", body: "Mean recovery time measures how long the trajectory takes to re-enter the adaptive region after escaping it." },
  "dyn-phase-entropy": { term: "Trajectory entropy", body: "Entropy summarizes how dispersed or predictable the arousal-attention orbit is across state space." },
  "dyn-phase-drift": { term: "Centroid drift", body: "Centroid drift measures how far the session orbit moves from its starting region to its ending region." },
  "dyn-cva-gap": { term: "Face-availability gap", body: "The gap compares how often the caregiver face is available with how often the infant looks to the face. The value is recomputed from visible CVA segments." },
  "dyn-cva-bouts": { term: "CVA bouts", body: "A CVA bout is a time interval where caregiver and infant attention overlap on the same toy target or face-related target." },
  "dyn-cva-duration": { term: "CVA duration", body: "Mean CVA duration is the average length of coordinated visual attention bouts in the selected session." },
  "dyn-cva-sticky": { term: "Sticky-look index", body: "The sticky-look index is the 90th percentile of infant single-target look duration, a compact attention-shifting summary." },
  "dyn-cva-scaffold": { term: "Scaffold latency", body: "Scaffold-to-shift latency estimates the time from caregiver scaffolding events to the infant's next attention shift." },
  "dyn-hr-depth": { term: "Deceleration depth", body: "Mean depth is the heart-rate trough below pre-onset baseline after sustained-attention onset." },
  "dyn-hr-trough": { term: "Time-to-trough", body: "Time-to-trough is the latency from attention onset to the deepest event-locked heart-rate deceleration." },
  "dyn-hr-duration": { term: "Deceleration duration", body: "Deceleration duration counts how long the mean curve stays meaningfully below baseline." },
  "dyn-hr-flag": { term: "Compensatory flag", body: "The compensatory flag marks unusually deep deceleration in the dashboard data. Confirm any scientific interpretation before external use." },
  "dyn-stillface-suppression": { term: "RSA suppression", body: "Suppression is the mean RSA drop from play to still-face stress within the structured paradigm." },
  "dyn-stillface-recovery": { term: "RSA recovery", body: "Recovery is reunion RSA minus still-face RSA, summarizing post-stress rebound." },
  "dyn-stillface-ratio": { term: "Recovery ratio", body: "The recovery ratio compares rebound to suppression magnitude. It is a within-session modulation metric." },
  "dyn-stillface-flag": { term: "Blunted flag", body: "The blunted flag highlights low suppression magnitude for review rather than making a clinical claim." },
  "dyn-hda-bypass": { term: "Bypass index", body: "Bypass index is P(orienting to termination) divided by P(orienting to sustained), the core transition-dynamics hypothesis." },
  "dyn-hda-ot": { term: "Orienting to termination", body: "This transition probability captures direct bypass from orienting into termination without sustained attention." },
  "dyn-hda-os": { term: "Orienting to sustained", body: "This transition probability captures the expected pathway from orienting into sustained attention." },
  "dyn-hda-dwell": { term: "Sustained dwell", body: "Sustained dwell is the average duration spent in sustained-attention states before transition." },
  "dyn-passport-group": { term: "Passport group", body: "The passport keeps the participant de-identified and uses only the NANOID plus cohort code." },
  "dyn-passport-role": { term: "Study role", body: "Study role separates NANO, NICO, ANONICO, and dual-enrolled routing from the analytic cohort code so operations staff can pick the right packet and forms." },
  "dyn-passport-enrollment": { term: "Enrollment type", body: "Enrollment type flags whether the participant follows one study workflow or needs dual-enrollment cross-checks across scheduling, forms, questionnaires, and REDCap." },
  "dyn-passport-ga": { term: "Gestational age", body: "Gestational age is shown as de-identified study context, especially useful for VPT longitudinal interpretation." },
  "dyn-passport-complete": { term: "Completeness", body: "Cascade completeness estimates how much expected longitudinal modality data is present for the participant." },
  "dyn-passport-risk": { term: "Risk trend", body: "Risk trend is a model-updated dashboard value and should be described as a model summary, not an individual clinical prediction." },
  "passport-header": { term: "Infant Passport", body: "The Passport shows one de-identified participant's longitudinal record - visit timeline, HRV, HDA, assessments, and QA notes - without any PHI." },
  "dyn-archetype-card": { term: "Trajectory archetype", body: "Archetype cards show longitudinal shape clusters. They answer developmental-shape questions that cross-sectional clusters cannot." },
  "dyn-arch-count": { term: "Archetype count", body: "The atlas groups whole trajectories into subtype shapes rather than clustering a single feature vector." },
  "dyn-arch-members": { term: "Members", body: "Members are de-identified participants assigned to a trajectory archetype with posterior probability." },
  "dyn-arch-ambiguous": { term: "Ambiguous fits", body: "Ambiguous fits have lower posterior membership and should be reviewed before being used as subtype exemplars." },
  "dyn-cascade-outcome": { term: "Outcome shift", body: "Outcome shift is a standardized model projection from slider changes, never a named-infant clinical prediction." },
  "dyn-cascade-uncertainty": { term: "Uncertainty band", body: "The uncertainty band is derived from fitted path standard errors and is shown to keep the what-if output appropriately cautious." },
  "dyn-cascade-fit": { term: "Model fit", body: "Model fit statistics help users judge whether the cascade projection is trustworthy enough for planning discussion." },
  "dyn-eco-arms": { term: "Collection arms", body: "The eco-validity panel compares lab and home collection arms using dashboard enrollment, behavior, and quality data." },
  "dyn-eco-delta": { term: "Lab-home delta", body: "Deltas are computed from dashboard data. External population comparisons carry a verification affordance." },
  "dyn-eco-home": { term: "Home higher", body: "This count summarizes how often the home arm exceeds the lab arm across selected ecological-validity metrics." },
  "dyn-stream-min": { term: "Minimum coverage", body: "Minimum coverage is the lowest valid-signal percentage across synchronized session streams." },
  "dyn-stream-gaps": { term: "Dropouts", body: "Dropouts count gaps in stream validity and point operators toward signal-level QA follow-up." },
  "dyn-stream-offset": { term: "Sync offset", body: "Sync offset estimates timing misalignment between streams such as ECG, markers, audio, and video." },
  "cga-river-helper": { term: "CGA River", body: "The CGA Milestone River shows HDA phase composition across corrected-age months. It is group-level only and uses canonical NANO milestones from 0 to 36 months." },
  "county-card": { term: "County profile", body: "County cards summarize county-level enrollment, completion, SDoH score, income proxy, and CPTd context without exposing addresses, ZIP codes, or participant-level locations." },
  "county-context": { term: "County context", body: "This paragraph turns the two selected county profiles into plain-language planning context. It should be read as aggregate outreach context, not an individual-family interpretation." },
  "attrition-stage": { term: "Retention stage", body: "Each funnel stage shows N, retained percent, and drop-off from the prior stage. Clicking a stage opens reason-code detail for grant and operations reporting." },
  "participant-timeline-detail": { term: "Timeline detail", body: "The Participant Passport Timeline uses de-identified NANO IDs and shape-coded marks for visits, QA flags, pipeline runs, failures, and REDCap milestones." },
  "participant-timeline-ops": { term: "Timeline operations", body: "Dual-overlap and packet-risk marks show when staff should verify enrollment type, linked forms, questionnaire routing, and the next visit packet before scheduling." },
  "model-terrain-explainer": { term: "Model terrain", body: "The model terrain view summarizes SHAP influence across feature value and developmental time. Higher color intensity means stronger model influence, not causality." },
  "guided-h1": { term: "Guided question H1", body: "This hypothesis card opens an RSA growth comparison between TD and VPT infants with confidence-interval context." },
  "guided-h2": { term: "Guided question H2", body: "This hypothesis card preconfigures the CGA River around ASIB sustained-attention composition at 6 months." },
  "guided-h3": { term: "Guided question H3", body: "This hypothesis card pairs higher and lower SDoH-burden counties so completion context is visible at county granularity." },
  "guided-h4": { term: "Guided question H4", body: "This hypothesis card routes to model-attribution surfaces focused on physiological features and developmental timing." },
  "guided-h5": { term: "Guided question H5", body: "This hypothesis card starts from retention differences across cohort groups and opens the attrition funnel." },
  "guided-narration": { term: "Guided narration", body: "The narration bubble gives a Buddy-aligned plain-language readout for the selected hypothesis before opening the full route." },
  "guided-explorer-step": { term: "Guided Explorer", body: "The 7-step tour walks new users through HDA phases, the RSA paradox, and the pipeline before they access operator surfaces." },
  "public-insights-irb": { term: "IRB badge", body: "The IRB badge confirms Protocol #Pro00115234. Only aggregate, de-identified data appears on this page." },
};

export function lookupInsight(id: string | null | undefined): InsightData | null {
  if (!id) return null;
  return INSIGHTS[id] ?? { term: "Insight", body: id };
}

function insightTarget(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest("[data-insight]") : null;
}

function resolveInsightFromElement(target: Element): InsightData | null {
  const term = target.getAttribute("data-insight-term")?.trim() ?? "";
  const body = target.getAttribute("data-insight-body")?.trim() ?? "";
  const fallback = lookupInsight(target.getAttribute("data-insight"));

  if (term || body) {
    return {
      term: term || fallback?.term || "Insight",
      body: body || fallback?.body || "",
    };
  }

  return fallback;
}

interface BuddySvgProps {
  talking: boolean;
  lookX: number;
  lookY: number;
}

function BuddySvg({ talking, lookX, lookY }: BuddySvgProps) {
  const eyeL = { cx: 36, cy: 50 };
  const eyeR = { cx: 60, cy: 50 };

  const offset = (dx: number, dy: number) => {
    const length = Math.sqrt(dx * dx + dy * dy);
    const max = 2.4;
    if (length < 1) return { x: 0, y: 0 };
    const scale = Math.min(max, length * 0.04) / length;
    return { x: dx * scale, y: dy * scale };
  };

  const left = offset(lookX - eyeL.cx, lookY - eyeL.cy);
  const right = offset(lookX - eyeR.cx, lookY - eyeR.cy);

  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <g>
        <path className={styles.antenna} d="M48 22 Q 50 14 55 8" />
        <circle className={styles.antennaDot} cx="55" cy="8" r="3" />
      </g>

      <ellipse className={styles.body} cx="48" cy="56" rx="32" ry="28" />
      <circle className={styles.blush} cx="22" cy="62" r="5" />
      <circle className={styles.blush} cx="74" cy="62" r="5" />

      <g className={styles.eye} style={{ transform: `translate(${left.x.toFixed(2)}px, ${left.y.toFixed(2)}px)` }}>
        <circle cx={eyeL.cx} cy={eyeL.cy} r="3" />
      </g>
      <g className={styles.eye} style={{ transform: `translate(${right.x.toFixed(2)}px, ${right.y.toFixed(2)}px)` }}>
        <circle cx={eyeR.cx} cy={eyeR.cy} r="3" />
      </g>

      {talking ? (
        <ellipse cx="48" cy="66" rx="5" ry="3.5" fill="var(--ink)" />
      ) : (
        <path className={styles.mouth} d="M42 64 Q 48 68 54 64" />
      )}

      <g>
        <path
          className={styles.heartPulse}
          transform="translate(72 32) scale(0.42)"
          d="M12 21s-7-4.5-9.5-9.2C0.7 8.5 2.3 5 5.5 5c1.9 0 3.6 1 4.5 2.5C10.9 6 12.6 5 14.5 5c3.2 0 4.8 3.5 3 6.8C19 16.5 12 21 12 21z"
        />
      </g>
    </svg>
  );
}

export interface BuddyProps {
  /**
   * Placement context. "shell" (default) offsets past the operator sidebar;
   * "page" anchors Buddy to the viewport bottom-left for sidebar-less
   * surfaces such as the public landing route.
   */
  anchor?: "shell" | "page";
}

/**
 * Settling delay before a hovered element becomes the active insight. Sweeping
 * a cursor across a dense panel crosses many hotspots that were never the
 * target; without this the bubble would restart on every one of them.
 */
const SETTLE_MS = 90;
/** Time the outgoing text is faded down before the incoming text replaces it. */
const SWAP_MS = 130;
/** Matches the bubble's CSS exit transition so content unmounts after it. */
const EXIT_MS = 260;

function sameInsight(a: InsightData | null, b: InsightData | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.term === b.term && a.body === b.body;
}

export function Buddy({ anchor = "shell" }: BuddyProps = {}) {
  // `insight` is the hover target; `displayed` is what the bubble currently
  // renders. Keeping them separate is what allows one to fade out before the
  // other fades in, instead of the text swapping under the reader.
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [displayed, setDisplayed] = useState<InsightData | null>(null);
  const [contentVisible, setContentVisible] = useState(false);
  const [look, setLook] = useState({ x: 48, y: 48 });
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const tourTrack = path === "/" || path === "/docs" || path === "/how-to" ? "public" : "operator";

  const buddyRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const lookFrameRef = useRef<number | null>(null);
  const pendingLookRef = useRef({ x: 48, y: 48 });

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const clearShowTimer = () => {
      if (showTimerRef.current != null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const showInsight = (target: Element | null) => {
      if (!(target instanceof Element)) return;
      clearHideTimer();
      clearShowTimer();
      target.classList.add("insight-active");
      const next = resolveInsightFromElement(target);
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        setInsight(next);
      }, SETTLE_MS);
    };

    const hideInsight = (target: Element | null, relatedTarget: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      if (target === insightTarget(relatedTarget)) return;
      target.classList.remove("insight-active");
      clearShowTimer();
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => setInsight(null), 500);
    };

    const onOver = (event: MouseEvent) => {
      showInsight(insightTarget(event.target));
    };

    const onOut = (event: MouseEvent) => {
      hideInsight(insightTarget(event.target), event.relatedTarget);
    };

    const onFocusIn = (event: FocusEvent) => {
      showInsight(insightTarget(event.target));
    };

    const onFocusOut = (event: FocusEvent) => {
      hideInsight(insightTarget(event.target), event.relatedTarget);
    };

    document.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseout", onOut, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      clearHideTimer();
      clearShowTimer();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Drive the crossfade: fade the current text down, swap it, fade the next up.
  useEffect(() => {
    if (insight === null) {
      if (displayed === null) return;
      setContentVisible(false);
      const timer = window.setTimeout(() => setDisplayed(null), EXIT_MS);
      return () => window.clearTimeout(timer);
    }

    if (displayed === null) {
      setDisplayed(insight);
      setContentVisible(true);
      return;
    }

    if (sameInsight(insight, displayed)) {
      setContentVisible(true);
      return;
    }

    setContentVisible(false);
    const timer = window.setTimeout(() => {
      setDisplayed(insight);
      setContentVisible(true);
    }, SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [insight, displayed]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const buddy = buddyRef.current;
      if (!buddy) return;
      const rect = buddy.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(-200, Math.min(200, event.clientX - cx));
      const dy = Math.max(-200, Math.min(200, event.clientY - cy));
      pendingLookRef.current = { x: 48 + dx, y: 48 + dy };
      if (lookFrameRef.current !== null) return;
      lookFrameRef.current = window.requestAnimationFrame(() => {
        lookFrameRef.current = null;
        setLook(pendingLookRef.current);
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      if (lookFrameRef.current !== null) {
        window.cancelAnimationFrame(lookFrameRef.current);
      }
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  // The stage stays mounted so entering and leaving are real CSS transitions;
  // a `display` toggle has no intermediate state to animate.
  const present = displayed !== null;

  return (
    <div
      className={[
        styles.stage,
        anchor === "page" ? styles.page : "",
        present ? styles.active : "",
      ].filter(Boolean).join(" ")}
      aria-live="polite"
      aria-hidden={present ? undefined : true}
    >
      <div className={`${styles.buddy} ${contentVisible ? styles.talking : ""}`} ref={buddyRef}>
        <BuddySvg talking={contentVisible} lookX={look.x} lookY={look.y} />
      </div>

      <div className={`${styles.bubble} ${contentVisible ? styles.show : ""}`}>
        {displayed && (
          <>
            <span className={styles.termTag}>{displayed.term}</span>
            <div className={styles.bodyText}>{displayed.body}</div>
            <button type="button" className={styles.tourButton} onClick={() => startNanoTour(tourTrack)}>
              Walk me through it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
