import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchNanoDashboardData,
  nanoQaPassedHeadline,
  nanoRedcapIndicator,
  normalizeNanoDashboardData,
} from "@/api/nanoDashboardData";

describe("normalizeNanoDashboardData", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches only the dedicated aggregate NANO artifact", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      nano: { meta: { study: "NANO", aggregate_only: true } },
    }), { status: 200 }));
    global.fetch = fetchMock as typeof global.fetch;

    const data = await fetchNanoDashboardData();

    expect(fetchMock).toHaveBeenCalledWith(
      "/dashboard/data/nano_dashboard_data.json",
      { headers: { accept: "application/json" } },
    );
    expect(data.meta.aggregateOnly).toBe(true);
  });

  it("keeps zero-valued aggregate metrics while leaving missing leaves null", () => {
    const data = normalizeNanoDashboardData({
      nano: {
        meta: { study: "NANO", n_target: 260, aggregate_only: true },
        enrollment: {
          target: 260,
          enrolled: 0,
          active: 0,
          by_group: [{ group: "ASIB", target: 65, enrolled: 0 }],
        },
        attention: { hda_sustained_pct: null },
        schedule: {
          timepoints: [{ id: "month_1", due: 0, upcoming_14d: 0, overdue: 0, completed: 0 }],
        },
        pipeline: [{ stage: "Model-ready", count: 1266, delta_7d: 0, qc_pass_pct: 0, qa_passed: 1266 }],
        pipeline_summary: { qa_passed_sessions: 1265 },
        redcap: { records_locked: 0, double_entry_discrepancies: 0 },
      },
    });

    expect(data.enrollment.enrolled).toBe(0);
    expect(data.enrollment.active).toBe(0);
    expect(data.enrollment.byGroup[0]?.enrolled).toBe(0);
    expect(data.schedule[0]?.overdue).toBe(0);
    expect(data.pipeline[0]?.qcPassPct).toBe(0);
    expect(data.pipelineSummary.qaPassedSessions).toBe(1265);
    expect(nanoQaPassedHeadline(data)).toBe(1265);
    expect(data.redcap.recordsLocked).toBe(0);
    expect(data.attention.hdaSustainedPct).toBeNull();
    expect(data.library.indexedDocuments).toBeNull();
  });

  it("falls back to the highest stage QA count only when the summary is missing", () => {
    const data = normalizeNanoDashboardData({
      nano: {
        pipeline: [
          { stage: "Ingested", count: 1300, qa_passed: 1200 },
          { stage: "Model-ready", count: 1266, qa_passed: 1266 },
        ],
      },
    });

    expect(data.pipelineSummary.qaPassedSessions).toBeNull();
    expect(nanoQaPassedHeadline(data)).toBe(1266);
  });

  it("never substitutes a pipeline stage count for a missing QA total", () => {
    const data = normalizeNanoDashboardData({
      nano: {
        pipeline: [
          { stage: "Ingested", count: 1300 },
          { stage: "Model-ready", count: 1266 },
        ],
      },
    });

    expect(nanoQaPassedHeadline(data)).toBeNull();
  });

  it("normalizes phase-by-group and model identity fields and derives a composite REDCap state", () => {
    const data = normalizeNanoDashboardData({
      nano: {
        meta: { source: "secure", aggregate_only: true },
        attention: {
          by_group_window: [{
            group: "ASIB",
            window: "1-3m",
            sustained_pct: 50,
            orienting_pct: 20,
            termination_pct: 10,
            inattention_pct: 20,
            hda_quality_bpm: 3.2,
          }],
        },
        redcap: { api_token_valid: false, sync_health: "ok", last_sync: "2026-07-15T12:00:00Z" },
        models: { best_model: "1D-CNN + LSTM", metric_name: "AUROC", best_metric: 0.899 },
      },
    });

    expect(data.attention.byGroupWindow[0]).toMatchObject({
      orientingPct: 20,
      terminationPct: 10,
      inattentionPct: 20,
    });
    expect(data.models).toMatchObject({ bestModel: "1D-CNN + LSTM", metricName: "AUROC" });
    expect(nanoRedcapIndicator(data)).toEqual({ label: "Token issue", state: "warning" });
  });

  it("filters non-applicable assessment cells and prefers age-at-intake aggregates", () => {
    const data = normalizeNanoDashboardData({
      nano: {
        enrollment: {
          age_at_intake: [{ stratum: "0-4 weeks", enrolled: 3 }],
          by_ga_stratum: { legacy: 9 },
        },
        assessments: [
          { instrument: "NNNS-II", timepoint: "month_1", applicable: true, complete: 0, expected: 0 },
          { instrument: "NNNS-II", timepoint: "month_36", applicable: false, complete: 0, expected: 0 },
        ],
      },
    });

    expect(data.enrollment.byGaStratum).toEqual([{ label: "0-4 weeks", count: 3 }]);
    expect(data.assessments).toHaveLength(1);
    expect(data.assessments[0]?.timepoint).toBe("month_1");
  });

  it("supports the legacy NANO enrollment keys during the additive transition", () => {
    const data = normalizeNanoDashboardData({
      nano: {
        study_meta: {
          award: "R01",
          n_target: 260,
          n_target_asib: 65,
          n_target_pt: 130,
          n_target_td: 65,
        },
        enrollment: { asib: 4, pt: 8, td: 2, total: 14 },
        active_followup: { early: 5, later: 7 },
      },
    });

    expect(data.enrollment.target).toBe(260);
    expect(data.enrollment.enrolled).toBe(14);
    expect(data.enrollment.active).toBe(12);
    expect(data.enrollment.byGroup).toEqual([
      { group: "ASIB", enrolled: 4, target: 65 },
      { group: "PT", enrolled: 8, target: 130 },
      { group: "TD", enrolled: 2, target: 65 },
    ]);
  });
});
