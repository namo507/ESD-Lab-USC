/**
 * TanStack Query hooks. One hook per endpoint; type-safe via Zod schemas.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import * as S from "./schemas";
import { z } from "zod";

const ParticipantList = z.array(S.Participant);
const StageList = z.array(S.Stage);
const RunList = z.array(S.Run);
const EpochList = z.array(S.Epoch);
const RedcapEventList = z.array(S.RedcapEvent);
const RunCreateResponse = z.object({ runId: z.string() });

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

export function useTriggerRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { scope: string; stages: string; workers: number }) =>
      api.post("/api/runs", body, RunCreateResponse),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
}
