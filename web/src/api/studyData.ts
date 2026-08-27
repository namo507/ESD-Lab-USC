/**
 * NANO + NICO study data layer.
 *
 * Reads the additive `nano` / `nico` / `shared` blocks that the dashboard
 * build orchestrator appends to `dashboard_data.json` (see the master
 * implementation prompt, §6.1). Kept separate from the REDCap payload hook so
 * the two contracts evolve independently and neither can break the other.
 *
 * All schema fields the UI reads are validated; deep leaf structures that the
 * UI only passes through are `.passthrough()` to stay forward-compatible with
 * pipeline additions.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import { REDCAP_DASHBOARD_DATA_URL } from "@/constants/redcapConfig";

const ScatterPoint = z.object({
  hrc_score: z.number(),
  sorf_asd_symptoms: z.number(),
});

const GrowthPoint = z.object({
  group: z.enum(["asib", "pt", "td"]),
  timepoint_m: z.number(),
  mean: z.number(),
  ci_low: z.number(),
  ci_high: z.number(),
});

const IndividualTrace = z.object({
  group: z.enum(["asib", "pt", "td"]),
  participant: z.string(),
  values: z.array(z.object({ timepoint_m: z.number(), value: z.number() })),
});

const LgcmOutcome = z
  .object({
    asib_intercept_mean: z.number().nullable(),
    asib_slope_mean: z.number().nullable(),
    pt_intercept_mean: z.number().nullable(),
    pt_slope_mean: z.number().nullable(),
    td_intercept_mean: z.number().nullable(),
    td_slope_mean: z.number().nullable(),
    asib_vs_td_intercept_p: z.number().nullable(),
    asib_vs_td_slope_p: z.number().nullable(),
    pt_vs_td_intercept_p: z.number().nullable(),
    pt_vs_td_slope_p: z.number().nullable(),
    growth_curves: z.array(GrowthPoint).default([]),
    individual_traces: z.array(IndividualTrace).default([]),
  })
  .passthrough();

const NanoSchema = z
  .object({
    study_meta: z
      .object({
        award: z.string(),
        start_date: z.string(),
        end_date: z.string(),
        n_target: z.number(),
        n_target_asib: z.number(),
        n_target_pt: z.number(),
        n_target_td: z.number(),
        pi: z.string(),
      })
      .passthrough(),
    enrollment: z
      .object({
        asib: z.number(),
        pt: z.number(),
        td: z.number(),
        total: z.number(),
        last_updated: z.string().default(""),
        by_ga_stratum: z.record(z.number()).default({}),
      })
      .passthrough(),
    active_followup: z.record(z.number()).default({}),
    ecg_quality: z
      .object({
        pct_valid_ecg_by_visit: z.record(z.number()).default({}),
        pct_hda_synced_by_visit: z.record(z.number()).default({}),
        flagged_participants: z.array(z.string()).default([]),
      })
      .passthrough(),
    lgcm_results: z
      .object({
        pct_sa: LgcmOutcome,
        hr_decel: LgcmOutcome,
        rsa: LgcmOutcome,
      })
      .passthrough(),
    ml_results: z
      .object({
        r2_by_outcome: z.record(z.record(z.number())).default({}),
        outcomes: z.array(z.string()).default([]),
        windows: z.array(z.string()).default([]),
        feature_importance: z
          .array(z.object({ feature: z.string(), mean_abs_shap: z.number() }))
          .default([]),
      })
      .passthrough(),
    preliminary_finding: z
      .object({
        label: z.string(),
        value: z.number(),
        type: z.string().default("accuracy"),
        n: z.number(),
        pilot: z.boolean().default(true),
      })
      .passthrough(),
  })
  .passthrough();

const NicoSchema = z
  .object({
    study_meta: z
      .object({
        award: z.string(),
        start_date: z.string(),
        end_date: z.string(),
        n_target_enrolled: z.number(),
        n_target_completers: z.number(),
        pi: z.string(),
      })
      .passthrough(),
    enrollment: z
      .object({
        total_enrolled: z.number(),
        in_nicu: z.number(),
        discharged: z.number(),
        completed_12m: z.number().default(0),
        completed_24m: z.number().default(0),
        completed_36m: z.number().default(0),
        last_updated: z.string().default(""),
      })
      .passthrough(),
    thermal_data: z
      .object({
        summary_stats: z
          .object({
            pct_days_ge_80_valid: z.number().nullable().default(null),
            median_cptd: z.number().nullable().default(null),
            pct_days_abnormal_cold: z.number().nullable().default(null),
            pct_days_abnormal_hot: z.number().nullable().default(null),
          })
          .passthrough()
          .default({}),
      })
      .passthrough(),
    hrc_scores: z
      .object({
        alert_threshold: z.number().default(5),
        summary: z.record(z.unknown()).default({}),
      })
      .passthrough(),
    morbidities: z
      .object({ cohort_rates: z.record(z.number().nullable()).default({}) })
      .passthrough(),
    aim3_clusters: z
      .object({
        n_clusters: z.number(),
        silhouette_score: z.number().nullable(),
        epsilon: z.number().nullable(),
        min_samples: z.number().nullable(),
        tsne_coords: z
          .array(
            z.object({
              participant: z.string(),
              x: z.number(),
              y: z.number(),
              cluster: z.number(),
              ados_css: z.number(),
              ga_weeks: z.number(),
              top_shap_feature: z.string(),
            }),
          )
          .default([]),
        trajectory_by_cluster: z.record(z.record(z.any())).default({}),
        trajectory_metrics: z.array(z.string()).default([]),
        hotelling_t2_matrix: z.array(z.array(z.number())).default([]),
        cluster_ados_css: z.record(z.number()).default({}),
      })
      .passthrough(),
    preliminary_finding: z
      .object({
        label: z.string(),
        r: z.number(),
        p: z.number(),
        n: z.number(),
        pilot: z.boolean().default(true),
        empirical_r: z.number().optional(),
        scatter_points: z.array(ScatterPoint).default([]),
      })
      .passthrough(),
  })
  .passthrough();

const SharedSchema = z
  .object({
    data_pipeline_run: z
      .object({
        last_success: z.string().default(""),
        last_error: z.string().default(""),
        stages_passed: z.array(z.string()).default([]),
        stages: z
          .array(z.object({ id: z.string(), label: z.string(), status: z.string() }))
          .default([]),
        record_deltas: z.record(z.number()).default({}),
        git_sha: z.string().default(""),
      })
      .passthrough(),
    changelog: z.array(z.record(z.unknown())).default([]),
  })
  .passthrough();

const LabOperationsSchema = z
  .object({
    generated_at: z.string().default(""),
    source_documents: z
      .array(
        z
          .object({
            study: z.string(),
            file: z.string(),
            pages: z.number(),
            award: z.string(),
            status: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    priority: z
      .object({
        primary_objective: z.string(),
        secondary_objective: z.string(),
        current_priority: z.string(),
        decision_dependency: z.string(),
        scope_guardrail: z.string(),
      })
      .passthrough(),
    dashboard_surface_status: z
      .array(
        z
          .object({
            area: z.string(),
            status: z.string(),
            shown: z.string(),
            next_need: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    current_problems: z
      .array(z.object({ category: z.string(), items: z.array(z.string()) }).passthrough())
      .default([]),
    recommendations: z
      .array(z.object({ horizon: z.string(), items: z.array(z.string()) }).passthrough())
      .default([]),
    reporting_management: z
      .object({
        status: z.string(),
        goal: z.string(),
        priority_note: z.string(),
        alignment_rule: z.string(),
        source_alignment: z
          .array(
            z
              .object({
                study: z.string(),
                anchor: z.string(),
                operational_relevance: z.string(),
              })
              .passthrough(),
          )
          .default([]),
      })
      .passthrough()
      .default({
        status: "planning",
        goal: "Define meaningful, actionable reporting before formal templates are built.",
        priority_note: "Start with demographic availability and participant tracking.",
        alignment_rule: "Align source ownership and cadence before building reports.",
        source_alignment: [],
      }),
    reporting_reviews: z
      .array(
        z
          .object({
            area: z.string(),
            status: z.string(),
            source_system: z.string(),
            why_actionable: z.string(),
            breakdowns: z.array(z.string()).default([]),
            next_action: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    priority_datasets: z
      .array(
        z
          .object({
            name: z.string(),
            study: z.string(),
            owner: z.string(),
            source_system: z.string(),
            pull_speed: z.string(),
            readiness: z.string(),
            report_use: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    systems_audit: z
      .array(
        z
          .object({
            track: z.string(),
            status: z.string(),
            captures: z.array(z.string()).default([]),
            output: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    budget_reporting: z
      .object({
        goal: z.string(),
        current_gap: z.string(),
        ready_now: z.array(z.string()).default([]),
        needs_alignment: z.array(z.string()).default([]),
        guardrail: z.string(),
      })
      .passthrough()
      .default({
        goal: "Prepare aggregate inputs for budget-facing project work.",
        current_gap: "Budget reporting needs source and owner alignment.",
        ready_now: [],
        needs_alignment: [],
        guardrail: "Do not connect live budget ledgers without approval.",
      }),
    external_collaborations: z
      .array(
        z
          .object({
            partner: z.string(),
            status: z.string(),
            current_value: z.string(),
            operational_gap: z.string(),
            next_action: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    next_month_reporting: z
      .array(
        z
          .object({
            metric: z.string(),
            owner: z.string(),
            source: z.string(),
            decision_use: z.string(),
            status: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    workflow_phases: z
      .array(
        z
          .object({
            id: z.string(),
            phase: z.string(),
            timeframe: z.string(),
            status: z.string(),
            study_focus: z.string(),
            tasks: z.array(z.string()).default([]),
            outputs: z.array(z.string()).default([]),
            owners: z.array(z.string()).default([]),
          })
          .passthrough(),
      )
      .default([]),
    role_workflows: z
      .array(
        z
          .object({
            role: z.string(),
            focus: z.string(),
            handoff: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    draft_metrics: z
      .array(
        z
          .object({
            name: z.string(),
            kind: z.string(),
            definition: z.string(),
            status: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    daily_routine: z
      .array(z.object({ block: z.string(), purpose: z.string() }).passthrough())
      .default([]),
    rollout_controls: z.array(z.string()).default([]),
    quick_wins: z.array(z.string()).default([]),
    family_data_sharing: z
      .object({
        current_state: z.string(),
        near_term_policy: z.string(),
        future_option: z.string(),
      })
      .passthrough(),
    assistant_sync: z
      .object({
        context_key: z.string(),
        buddy_insights: z.array(z.string()).default([]),
        fast_paths: z.array(z.string()).default([]),
      })
      .passthrough(),
  })
  .passthrough();

export const StudyDataSchema = z.object({
  nano: NanoSchema,
  nico: NicoSchema,
  shared: SharedSchema,
  lab_operations: LabOperationsSchema.optional(),
});

export type StudyData = z.infer<typeof StudyDataSchema>;
export type NanoData = z.infer<typeof NanoSchema>;
export type NicoData = z.infer<typeof NicoSchema>;
export type SharedData = z.infer<typeof SharedSchema>;
export type LabOperationsData = z.infer<typeof LabOperationsSchema>;
export type LgcmOutcomeData = z.infer<typeof LgcmOutcome>;
export type GrowthPointData = z.infer<typeof GrowthPoint>;
export type ScatterPointData = z.infer<typeof ScatterPoint>;

async function fetchStudyData(): Promise<StudyData> {
  const response = await fetch(REDCAP_DASHBOARD_DATA_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const json = (await response.json()) as unknown;
  return StudyDataSchema.parse(json);
}

export function useStudyData(enabled = true): UseQueryResult<StudyData> {
  return useQuery({
    enabled,
    queryKey: ["study", "nano-nico-data"],
    queryFn: fetchStudyData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
