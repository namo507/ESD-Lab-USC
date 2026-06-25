/**
 * TanStack Query hooks. One hook per endpoint; type-safe via Zod schemas.
 */
import { useCallback, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "./client";
import * as S from "./schemas";
import { z, type ZodType } from "zod";
import { fetchAssistantStatus } from "./chatApi";
import { CARRY_FORWARD, EVENT_LABELS, REDCAP_DASHBOARD_DATA_URL } from "@/constants/redcapConfig";
import {
  RedcapOps,
  RedcapPayload,
  type RedcapCompletionStat,
  type RedcapOps as RedcapOpsType,
  type RedcapPayload as RedcapPayloadType,
} from "./redcapSchemas";
import {
  planPresentation,
  createPresentationJob,
  getPresentationJob,
  type PlanPresentationInput,
} from "./presentationApi";

const ParticipantList = z.array(S.Participant);
const StageList = z.array(S.Stage);
const RunList = z.array(S.Run);
const EpochList = z.array(S.Epoch);
const RedcapEventList = z.array(S.RedcapEvent);
const RunCreateResponse = z.object({ runId: z.string() });
const PublicationTagList = z.array(S.PublicationTagCount);
const DatasetSnapshotList = z.array(S.DatasetSnapshot);
const AdminCapabilitiesResponse = S.AdminCapabilities;

function queryString(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "All") return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== "") search.append(key, String(entry));
      });
      return;
    }
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function useStudySummary() {
  return useQuery({
    queryKey: ["study", "summary"],
    queryFn: () => api.get("/api/study/summary", S.StudySummary),
    staleTime: 60_000,
  });
}

export function useStages() {
  return useQuery({
    queryKey: ["pipeline", "stages"],
    queryFn: () => api.get("/api/pipeline/stages", StageList),
    refetchInterval: 30_000,
  });
}

export function useRuns(limit = 20) {
  return useQuery({
    queryKey: ["runs", { limit }],
    queryFn: () => api.get(`/api/runs?limit=${limit}`, RunList),
    refetchInterval: 15_000,
  });
}

export function useParticipants() {
  return useQuery({
    queryKey: ["participants"],
    queryFn: () => api.get("/api/participants", ParticipantList),
  });
}

export function useParticipant(id: string | undefined) {
  return useQuery({
    enabled: Boolean(id),
    queryKey: ["participant", id],
    queryFn: () => api.get(`/api/participants/${id}`, S.ParticipantDetail),
  });
}

export function useEpochs(visitId: string | undefined) {
  return useQuery({
    enabled: Boolean(visitId),
    queryKey: ["epochs", visitId],
    queryFn: () => api.get(`/api/visits/${visitId}/epochs`, EpochList),
  });
}

/**
 * Optimistic epoch decision mutation.
 * Server reconciles via PATCH; on failure, the cache rolls back to the
 * snapshot captured before mutation.
 */
export function useEpochDecision(visitId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idx, decision }: { idx: number; decision: S.EpochDecision }) =>
      api.patch(`/api/visits/${visitId}/epochs/${idx}`, { decision }, S.Epoch),
    onMutate: async ({ idx, decision }) => {
      await qc.cancelQueries({ queryKey: ["epochs", visitId] });
      const prev = qc.getQueryData<S.Epoch[]>(["epochs", visitId]);
      if (prev) {
        qc.setQueryData<S.Epoch[]>(
          ["epochs", visitId],
          prev.map((e) => (e.idx === idx ? { ...e, decision } : e)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["epochs", visitId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["epochs", visitId] }),
  });
}

export function useTrajectory(metric: "rmssd" | "hf" | "sdnn") {
  return useQuery({
    queryKey: ["trajectory", metric],
    queryFn: () => api.get(`/api/results/trajectory?metric=${metric}`, S.Trajectory),
  });
}

export function useHdaDist() {
  return useQuery({
    queryKey: ["hda"],
    queryFn: () => api.get("/api/results/hda", S.HdaDist),
  });
}

export function useRedcapEvents(since?: string) {
  return useQuery({
    queryKey: ["redcap", since ?? "now"],
    queryFn: () =>
      api.get(
        `/api/redcap/events${since ? `?since=${encodeURIComponent(since)}` : ""}`,
        RedcapEventList,
      ),
    refetchInterval: 30_000,
  });
}

export function useMatlabIntegration() {
  return useQuery({
    queryKey: ["matlab", "integration"],
    queryFn: () => api.get("/api/matlab/integration", S.MatlabIntegration),
    refetchInterval: 60_000,
  });
}

export function useTableQuery<T>(
  params: S.TableQueryParams,
  schema: ZodType<T[]>,
): UseQueryResult<S.PaginatedResponse<T>> {
  const ResponseSchema = z.object({
    rows: schema,
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
  return useQuery({
    queryKey: ["table-query", params],
    queryFn: () => api.post("/api/table/query", params, ResponseSchema),
    staleTime: 30_000,
  });
}

export function usePublications(
  params?: S.PublicationQueryParams,
): UseQueryResult<S.PublicationListResponse> {
  return useQuery({
    queryKey: ["publications", params ?? {}],
    queryFn: () => api.get(`/api/publications${queryString(params)}`, S.PublicationListResponse),
    staleTime: 5 * 60_000,
  });
}

export function usePublication(pmid: string | undefined): UseQueryResult<S.Publication> {
  return useQuery({
    enabled: Boolean(pmid),
    queryKey: ["publication", pmid],
    queryFn: () => api.get(`/api/publications/${encodeURIComponent(pmid as string)}`, S.Publication),
  });
}

export function usePublicationTags(): UseQueryResult<S.PublicationTagCount[]> {
  return useQuery({
    queryKey: ["publications", "tags"],
    queryFn: () => api.get("/api/publications/tags", PublicationTagList),
    staleTime: 5 * 60_000,
  });
}

export function usePublicationSyncStatus(): UseQueryResult<S.SyncStatus> {
  return useQuery({
    queryKey: ["publications", "sync", "status"],
    queryFn: () => api.get("/api/publications/sync/status", S.SyncStatus),
    refetchInterval: 60_000,
  });
}

export function useSyncPublications(): UseMutationResult<S.SyncStatus, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/publications/sync/trigger", {}, S.SyncStatus),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["publications"] });
    },
  });
}

export function useUpdatePublicationTags(
  pmid: string | undefined,
): UseMutationResult<S.Publication, unknown, { tags: string[] }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.patch(`/api/publications/${encodeURIComponent(pmid as string)}/tags`, body, S.Publication),
    onSuccess: (publication) => {
      void qc.invalidateQueries({ queryKey: ["publication", pmid] });
      void qc.invalidateQueries({ queryKey: ["publications"] });
      qc.setQueryData(["publication", publication.pmid], publication);
    },
  });
}

export function useChangelog(
  params?: S.ChangelogQueryParams,
): UseQueryResult<S.PaginatedResponse<S.ChangelogEntry>> {
  return useQuery({
    queryKey: ["changelog", params ?? {}],
    queryFn: () => api.get(`/api/changelog${queryString(params)}`, S.PaginatedResponse(S.ChangelogEntry)),
    staleTime: 30_000,
  });
}

export function useEntityHistory(
  entityType: string,
  entityId: string | undefined,
): UseQueryResult<S.ChangelogEntry[]> {
  return useQuery({
    enabled: Boolean(entityId),
    queryKey: ["changelog", entityType, entityId],
    queryFn: () => api.get(`/api/changelog/${entityType}/${encodeURIComponent(entityId as string)}`, z.array(S.ChangelogEntry)),
    staleTime: 30_000,
  });
}

export function useSnapshots(): UseQueryResult<S.DatasetSnapshot[]> {
  return useQuery({
    queryKey: ["snapshots"],
    queryFn: () => api.get("/api/snapshots", DatasetSnapshotList),
    staleTime: 60_000,
  });
}

export function useCreateSnapshot(): UseMutationResult<
  S.DatasetSnapshot,
  unknown,
  { tag: string; description: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post("/api/snapshots", body, S.DatasetSnapshot),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["snapshots"] });
      void qc.invalidateQueries({ queryKey: ["changelog"] });
    },
  });
}

export function useAdminCapabilities(): UseQueryResult<S.AdminCapabilities> {
  return useQuery({
    queryKey: ["admin", "capabilities"],
    queryFn: () => api.get("/api/admin/capabilities", AdminCapabilitiesResponse),
    staleTime: 60_000,
  });
}

export function useRsaTrajectories(ageBasis: "adjusted" | "chronological" = "adjusted") {
  return useQuery({
    queryKey: ["v2", "rsa-trajectories", ageBasis],
    queryFn: () => api.get(`/api/v2/rsa-trajectories?age=${ageBasis}`, S.RsaTrajectoryResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useRedcapCompleteness() {
  return useQuery({
    queryKey: ["v2", "redcap-completeness"],
    queryFn: () => api.get("/api/v2/redcap-completeness", S.RedcapCompletenessResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

const VISIT_EVENT_KEY: Record<string, "sixMonth" | "nineMonth" | "twelveMonth" | "twentyFourMonth"> = {
  "6_months_arm_1": "sixMonth",
  "9_months_arm_1": "nineMonth",
  "12_months_arm_1": "twelveMonth",
  "24_months_arm_1": "twentyFourMonth",
};

function emptyCompletionStat(eventName: string): RedcapCompletionStat {
  return {
    label: EVENT_LABELS[eventName as keyof typeof EVENT_LABELS]?.replace(" Months", "m").replace(" Month", "m") ?? eventName,
    complete: 0,
    unverified: 0,
    incomplete: 0,
    not_started: 0,
    skipped: 0,
    total: 0,
  };
}

function completionStatsFromRecords(records: S.RedcapVisitRecord[]): Record<string, RedcapCompletionStat> {
  const stats = Object.fromEntries(
    CARRY_FORWARD.events.map((eventName) => [eventName, emptyCompletionStat(eventName)]),
  ) as Record<string, RedcapCompletionStat>;
  for (const eventName of CARRY_FORWARD.events) {
    const key = VISIT_EVENT_KEY[eventName];
    if (!key) continue;
    for (const record of records) {
      const stat = stats[eventName];
      if (!stat) continue;
      const status = record[key].csbsStatus;
      stat[status] += 1;
      stat.total += 1;
    }
  }
  return stats;
}

function legacyVisitHealthToPayload(health: S.RedcapVisitHealthResponse): RedcapPayloadType {
  const anomalyCount = health.data.filter((row) => row.hasCarryForwardRisk).length;
  const completionStats = completionStatsFromRecords(health.data);
  const generatedAt = health.meta.generatedAt;
  return {
    redcap_meta: {
      generated_at: generatedAt,
      pid: 5955,
      record_count: health.data.length,
      anomaly_count: anomalyCount,
      source: health.meta.source ?? "legacy-api",
      contract_version: "2.0",
      payload_version: generatedAt,
    },
    redcap_completion_stats: completionStats,
    redcap_visit_health: {
      anomaly_count: anomalyCount,
      data: health.data,
    },
    redcap_trackers: {
      enrollment: CARRY_FORWARD.events.map((eventName) => {
        const stat = completionStats[eventName] ?? emptyCompletionStat(eventName);
        return {
          event: eventName,
          label: stat.label,
          expected: stat.total,
          scheduled: stat.total,
          completed: stat.complete,
        };
      }),
      instrument_completeness: [{
        instrument: "csbs_caregiver",
        label: "CSBS Caregiver",
        byEvent: Object.fromEntries(
          Object.entries(completionStats).map(([eventName, stat]) => [
            eventName,
            { complete: stat.complete, total: stat.total },
          ]),
        ),
      }],
      queue_funnel: [
        { stage: "expected", count: Object.values(completionStats).reduce((sum, stat) => sum + stat.total, 0) },
        { stage: "scheduled", count: Object.values(completionStats).reduce((sum, stat) => sum + stat.total, 0) },
        { stage: "started", count: Object.values(completionStats).reduce((sum, stat) => sum + stat.complete + stat.unverified + stat.incomplete + stat.skipped, 0) },
        { stage: "complete", count: Object.values(completionStats).reduce((sum, stat) => sum + stat.complete, 0) },
      ],
      thresholds: { completeness_warn_pct: 0.8, stale_visit_days: 30 },
    },
    redcap_timeline: {
      records: health.data.map((record) => ({
        recordId: record.recordId,
        events: [
          { event: "6_months_arm_1", label: "6m", month: 6, visitDate: record.sixMonth.visitDate ?? "", status: record.sixMonth.csbsStatus, hasRisk: record.hasCarryForwardRisk },
          { event: "9_months_arm_1", label: "9m", month: 9, visitDate: record.nineMonth.visitDate ?? "", status: record.nineMonth.csbsStatus, hasRisk: record.hasCarryForwardRisk },
          { event: "12_months_arm_1", label: "12m", month: 12, visitDate: record.twelveMonth.visitDate ?? "", status: record.twelveMonth.csbsStatus, hasRisk: record.hasCarryForwardRisk },
          { event: "24_months_arm_1", label: "24m", month: 24, visitDate: record.twentyFourMonth.visitDate ?? "", status: record.twentyFourMonth.csbsStatus, hasRisk: record.hasCarryForwardRisk },
        ],
      })),
    },
    redcap_clinical: {
      epds_trajectory: [],
      developmental_grid: [],
      family_risk: [],
      cascade_edges: [],
      ados_flow: [],
    },
    redcap_integrity: {
      nullity_matrix: [],
      field_presence: [],
      double_entry_diffs: [],
      mismatch_trend: [],
      response_quality: [],
      branching_violations: [],
      validation_radar: [],
    },
    redcap_schedule: {
      window_adherence: [],
      retention_survival: [],
      collection_calendar: [],
      upcoming_visits: [],
      entry_lag: [],
    },
    redcap_respondent: {
      caregiver_burden: [],
      respondent_concordance: [],
    },
    redcap_platform: {
      audit_log: [],
      reports: [],
      file_repository: [],
      users: [],
    },
    redcap_predictive: {
      attrition_risk: [],
      nl_query_enabled: false,
    },
    clinical_cutoffs: {
      epds_positive: 10,
      epds_high: 13,
      epds_self_harm_item_min: 1,
      asq_monitor: 35,
      asq_refer: 25,
      visit_window_days: 30,
      dp_epsilon: 1,
    },
    redcap_ops: {
      freshness: {
        generated_at: generatedAt,
        age_hours: 0,
        source: health.meta.source ?? "legacy-api",
        sla_hours: 48,
      },
      runtime_parity: {},
      run_ledger: [{
        run_id: `legacy-${generatedAt}`,
        started_at: generatedAt,
        status: "ok",
        records: health.data.length,
        anomalies: anomalyCount,
      }],
    },
  };
}

async function fetchRedcapDashboardPayload(): Promise<RedcapPayloadType> {
  try {
    const response = await fetch(REDCAP_DASHBOARD_DATA_URL, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const json = (await response.json()) as unknown;
    return RedcapPayload.parse(json);
  } catch {
    const health = await api.get("/api/v2/redcap-visit-health", S.RedcapVisitHealthResponse);
    return legacyVisitHealthToPayload(health);
  }
}

export function useRedcapData(enabled = true): UseQueryResult<RedcapPayloadType> {
  return useQuery({
    enabled,
    queryKey: ["redcap", "dashboard-data"],
    queryFn: fetchRedcapDashboardPayload,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useRedcapOps(enabled = true): UseQueryResult<RedcapOpsType> {
  return useQuery({
    enabled,
    queryKey: ["redcap", "ops"],
    queryFn: async () => {
      try {
        return await api.get("/api/ops", RedcapOps);
      } catch {
        const payload = await fetchRedcapDashboardPayload();
        return payload.redcap_ops;
      }
    },
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 60_000,
  });
}

export function useRedcapVisitHealth(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["v2", "redcap-visit-health"],
    queryFn: async () => {
      const payload = await fetchRedcapDashboardPayload();
      return S.RedcapVisitHealthResponse.parse({
        data: payload.redcap_visit_health.data,
        meta: {
          generatedAt: payload.redcap_meta.generated_at,
          participantCount: payload.redcap_meta.record_count,
          source: payload.redcap_meta.source,
        },
        anomalies: payload.redcap_visit_health.data
          .filter((row) => row.hasCarryForwardRisk)
          .map((row) => ({ recordId: row.recordId, risks: row.anomalyFlags })),
        visitOptions: CARRY_FORWARD.events.map((eventName) => ({
          key: VISIT_EVENT_KEY[eventName],
          label: payload.redcap_completion_stats[eventName]?.label ?? eventName,
          eventName,
        })).filter((item) => Boolean(item.key)),
      });
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useRedcapVisitDetail(recordId: string | undefined) {
  return useQuery({
    enabled: Boolean(recordId),
    queryKey: ["v2", "redcap-visit-health", recordId],
    queryFn: () =>
      api.get(
        `/api/v2/redcap-visit-health/${encodeURIComponent(recordId as string)}`,
        S.RedcapVisitRecordDetail,
      ),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useRedcapMissingData(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["v2", "redcap-missing-data"],
    queryFn: () => api.get("/api/v2/redcap-missing-data", S.RedcapMissingDataResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useRedcapVisitEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { recordId: string; eventName: string; visitDate: string }) =>
      api.post("/api/v2/redcap-visit-entry", body, S.RedcapImportResponse),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "redcap-visit-health"] });
      void qc.invalidateQueries({ queryKey: ["v2", "redcap-missing-data"] });
      void qc.invalidateQueries({ queryKey: ["redcap", "dashboard-data"] });
    },
  });
}

export function useHdaSession(nanoId: string | undefined, visitAge: number | undefined) {
  return useQuery({
    enabled: Boolean(nanoId) && visitAge !== undefined,
    queryKey: ["v2", "hda-session", nanoId, visitAge],
    queryFn: () => api.get(`/api/v2/hda-session/${nanoId}/${visitAge}`, S.HdaSessionResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useThermalHeatmap(nanoId: string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId),
    queryKey: ["v2", "thermal-heatmap", nanoId],
    queryFn: () => api.get(`/api/v2/thermal-heatmap/${nanoId}`, S.ThermalHeatmapResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useCohortSwimmer() {
  return useQuery({
    queryKey: ["v2", "cohort-swimmer"],
    queryFn: () => api.get("/api/v2/cohort-swimmer", S.CohortSwimmerResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useHdaComposition() {
  return useQuery({
    queryKey: ["v2", "hda-composition"],
    queryFn: () => api.get("/api/v2/hda-composition", S.HdaCompositionResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useAttritionFunnel() {
  return useQuery({
    queryKey: ["v2", "attrition-funnel"],
    queryFn: () => api.get("/api/v2/attrition-funnel", S.AttritionFunnelResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useCountyProfiles() {
  return useQuery({
    queryKey: ["v2", "county-profiles"],
    queryFn: () => api.get("/api/v2/county-profiles", S.CountyProfileResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useSdohMap() {
  return useQuery({
    queryKey: ["v2", "sdoh-map"],
    queryFn: () => api.get("/api/v2/sdoh-map", S.SdohMapResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useShapValues() {
  return useQuery({
    queryKey: ["v2", "shap-values"],
    queryFn: () => api.get("/api/v2/shap-values", S.ShapValuesResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useClusterTsne() {
  return useQuery({
    queryKey: ["v2", "cluster-tsne"],
    queryFn: () => api.get("/api/v2/cluster-tsne", S.ClusterTsneResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useModelLeaderboard() {
  return useQuery({
    queryKey: ["v2", "model-leaderboard"],
    queryFn: () => api.get("/api/v2/model-leaderboard", S.ModelLeaderboardResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useModelLeaderboardDetail(modelId: string | undefined) {
  return useQuery({
    enabled: Boolean(modelId),
    queryKey: ["v2", "model-leaderboard", modelId],
    queryFn: () => api.get(`/api/v2/model-leaderboard/${modelId}`, S.ModelLeaderboardDetailResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useCascadeDag() {
  return useQuery({
    queryKey: ["v2", "cascade-dag"],
    queryFn: () => api.get("/api/v2/cascade-dag", S.CascadeDagResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useEcgQuality(nanoId: string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId),
    queryKey: ["v2", "ecg-quality", nanoId],
    queryFn: () => api.get(`/api/v2/ecg-quality/${nanoId}`, S.EcgQualityResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useEcgQualitySummary() {
  return useQuery({
    queryKey: ["v2", "ecg-quality-summary"],
    queryFn: () => api.get("/api/v2/ecg-quality-summary", S.EcgQualitySummaryResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useDyadCoregulation(nanoId: string | undefined, visitAge: number | string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId) && visitAge !== undefined,
    queryKey: ["v2", "dyad-coregulation", nanoId, visitAge],
    queryFn: () => api.get(`/api/v2/dyad/coregulation/${nanoId}/${visitAge}`, S.DyadCoregulationResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useMultimodalSession(nanoId: string | undefined, visitAge: number | string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId) && visitAge !== undefined,
    queryKey: ["v2", "multimodal", nanoId, visitAge],
    queryFn: () => api.get(`/api/v2/multimodal/${nanoId}/${visitAge}`, S.MultimodalSessionResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function usePhasePortrait(nanoId: string | undefined, visitAge: number | string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId) && visitAge !== undefined,
    queryKey: ["v2", "phase-portrait", nanoId, visitAge],
    queryFn: () => api.get(`/api/v2/phase-portrait/${nanoId}/${visitAge}`, S.PhasePortraitResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useCvaTheater(nanoId: string | undefined, visitAge: number | string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId) && visitAge !== undefined,
    queryKey: ["v2", "cva", nanoId, visitAge],
    queryFn: () => api.get(`/api/v2/cva/${nanoId}/${visitAge}`, S.CvaResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useHrDeceleration(group = "ASIB", ageBin = "6mo") {
  return useQuery({
    queryKey: ["v2", "hr-deceleration", group, ageBin],
    queryFn: () => api.get(`/api/v2/hr-deceleration?group=${group}&ageBin=${ageBin}`, S.HrDecelerationResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useStillFace(nanoId: string | undefined, visitAge: number | string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId) && visitAge !== undefined,
    queryKey: ["v2", "stillface", nanoId, visitAge],
    queryFn: () => api.get(`/api/v2/stillface/${nanoId}/${visitAge}`, S.StillFaceResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useHdaTransitions(group = "ASIB", ageBin = "6mo") {
  return useQuery({
    queryKey: ["v2", "hda-transitions", group, ageBin],
    queryFn: () => api.get(`/api/v2/hda-transitions?group=${group}&ageBin=${ageBin}`, S.HdaTransitionsResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function usePassport(nanoId: string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId),
    queryKey: ["v2", "passport", nanoId],
    queryFn: () => api.get(`/api/v2/passport/${nanoId}`, S.PassportResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useArchetypes(measure = "rsa") {
  return useQuery({
    queryKey: ["v2", "archetypes", measure],
    queryFn: () => api.get(`/api/v2/archetypes?measure=${measure}`, S.ArchetypesResponse),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useCascadePaths() {
  return useQuery({
    queryKey: ["v2", "cascade-paths"],
    queryFn: () => api.get("/api/v2/cascade-paths", S.CascadePathsResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useEcoValidity() {
  return useQuery({
    queryKey: ["v2", "eco-validity"],
    queryFn: () => api.get("/api/v2/eco-validity", S.EcoValidityResponse),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function useStreamCoverage(nanoId: string | undefined, visitAge: number | string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId) && visitAge !== undefined,
    queryKey: ["v2", "stream-coverage", nanoId, visitAge],
    queryFn: () => api.get(`/api/v2/stream-coverage/${nanoId}/${visitAge}`, S.StreamCoverageResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

export function useClusterTopology() {
  return useQuery({
    queryKey: ["cluster", "topology"],
    queryFn: () => api.get("/api/cluster/topology", S.ClusterTopology),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useClusterPipeline() {
  return useQuery({
    queryKey: ["cluster", "pipeline"],
    queryFn: () => api.get("/api/cluster/pipeline", S.ClusterPipeline),
    refetchInterval: 10_000,
    retry: false,
  });
}

export function useReadingsFreshness() {
  return useQuery({
    queryKey: ["readings", "freshness"],
    queryFn: () => api.get("/api/readings/freshness", S.ReadingsFreshness),
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useReadingsLibrary() {
  return useQuery({
    queryKey: ["readings", "library"],
    queryFn: () => api.get("/api/readings/library", S.ReadingsLibrary),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useTriggerRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { scope: string; stages: string; workers: number }) =>
      api.post("/api/runs", body, RunCreateResponse),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
}

/**
 * Local assistant readiness, shared by the Presentation Maker gate.
 * Reuses the same status endpoint (with legacy fallback) as the chat drawer.
 */
export function useAssistantStatus() {
  return useQuery({
    queryKey: ["assistant", "status"],
    queryFn: () => fetchAssistantStatus(),
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  });
}

/**
 * Concept → structured deck plan, via the synchronous compatibility endpoint.
 * Retained for back-compat; the public UI uses `usePresentationJob` instead.
 */
export function usePresentationPlan() {
  return useMutation({
    mutationFn: (input: PlanPresentationInput) => planPresentation(input),
  });
}

export type PresentationJobPhase =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

const DEFAULT_PRESENTATION_QUEUE_POLL_MS = 900;
const DEFAULT_PRESENTATION_RUNNING_POLL_MS = 1400;

export function presentationJobPollInterval(
  job:
    | Pick<S.PresentationJobCreated, "status" | "poll_after_ms">
    | Pick<S.PresentationJobState, "status" | "poll_after_ms">
    | null
    | undefined,
): number | false {
  if (!job) return DEFAULT_PRESENTATION_QUEUE_POLL_MS;
  if (job.status === "succeeded" || job.status === "failed" || job.status === "expired") {
    return false;
  }
  if (typeof job.poll_after_ms === "number" && job.poll_after_ms > 0) {
    return job.poll_after_ms;
  }
  return job.status === "running"
    ? DEFAULT_PRESENTATION_RUNNING_POLL_MS
    : DEFAULT_PRESENTATION_QUEUE_POLL_MS;
}

export interface PresentationJobView {
  phase: PresentationJobPhase;
  /** True while submitting, queued, or generating. */
  isPending: boolean;
  isError: boolean;
  /** The deck-plan envelope, present only on success. */
  data: S.PresentationPlanResponse | undefined;
  progressMessage: string | null;
  error: string | null;
  start: (input: PlanPresentationInput) => void;
  reset: () => void;
}

/**
 * Async presentation generation: create a job, then poll until it reaches a
 * terminal state. This is the public-safe path — each request is fast, so the
 * Cloudflare Pages proxy never depends on one long-lived connection.
 *
 * Audit logging happens once (inside `createPresentationJob`); polling does not
 * audit. Polling stops automatically on success/failure/expiry.
 */
export function usePresentationJob(): PresentationJobView {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: PlanPresentationInput) => createPresentationJob(input),
    onSuccess: (created) => setJobId(created.job_id),
  });

  const poll = useQuery({
    queryKey: ["presentation", "job", jobId],
    queryFn: () => getPresentationJob(jobId as string),
    enabled: Boolean(jobId),
    refetchOnWindowFocus: false,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: (query) => presentationJobPollInterval(query.state.data),
  });

  const start = useCallback(
    (input: PlanPresentationInput) => {
      if (jobId) qc.removeQueries({ queryKey: ["presentation", "job", jobId] });
      setJobId(null);
      create.reset();
      create.mutate(input);
    },
    [create, jobId, qc],
  );

  const reset = useCallback(() => {
    if (jobId) qc.removeQueries({ queryKey: ["presentation", "job", jobId] });
    setJobId(null);
    create.reset();
  }, [create, jobId, qc]);

  const status = poll.data?.status;
  const createFailed = create.isError;
  const pollFailed = Boolean(jobId) && poll.isError;

  let phase: PresentationJobPhase = "idle";
  if (status === "succeeded") phase = "succeeded";
  else if (status === "failed" || status === "expired" || createFailed || pollFailed) phase = "failed";
  else if (status === "running") phase = "running";
  else if (create.isPending || status === "queued" || Boolean(jobId)) phase = "queued";

  const isError = phase === "failed";
  const isPending = !isError && (phase === "queued" || phase === "running");
  const data = status === "succeeded" ? poll.data?.result : undefined;

  const error = isError
    ? poll.data?.error
      ?? (create.error instanceof Error ? create.error.message : null)
      ?? "Generation didn’t complete. Please try again."
    : null;

  const progressMessage = poll.data?.progress_message
    ?? (phase === "queued"
      ? "Queued — waiting for the local model…"
      : phase === "running"
        ? "Composing your deck…"
        : null);

  return { phase, isPending, isError, data, progressMessage, error, start, reset };
}
