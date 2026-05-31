/**
 * TanStack Query hooks. One hook per endpoint; type-safe via Zod schemas.
 */
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import * as S from "./schemas";
import { z } from "zod";
import { fetchAssistantStatus } from "./chatApi";
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
