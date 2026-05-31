/**
 * Presentation Maker API helper.
 *
 * Mirrors the chat assistant's hygiene discipline: the concept is scrubbed of
 * likely PHI *before* it leaves the page, the action is audit-logged, and the
 * response is validated with the same Zod-backed fetch client every other
 * route uses. The server (live_dashboard_server.py) drives the local GGUF
 * assistant and returns a strict, structured deck plan — never raw model text.
 */
import { api } from "./client";
import * as S from "./schemas";
import { logAudit } from "@/lib/audit";
import { scrubPhi } from "@/lib/phiScrub";

export interface PlanPresentationInput {
  concept: string;
  options: S.PresentationOptions;
}

/**
 * Request a structured deck plan for `concept`.
 *
 * Throws `ApiError` (from client.ts) on a non-2xx response or a schema
 * mismatch, so React Query surfaces a clean error state without leaking model
 * internals.
 */
export async function planPresentation(
  { concept, options }: PlanPresentationInput,
): Promise<S.PresentationPlanResponse> {
  const cleanConcept = scrubPhi(concept).text;

  await logAudit({ action: "presentation.generate", scope: "/presentation-maker" });

  return api.post(
    "/api/presentation/plan",
    { concept: cleanConcept, options },
    S.PresentationPlanResponse,
  );
}

/**
 * Async flow (public default): create a job, then poll it to a terminal state.
 *
 * `createPresentationJob` scrubs PHI before the concept leaves the browser and
 * audits exactly once, on creation. `getPresentationJob` is poll-only and never
 * audits, so polling does not spam the audit log.
 */
export async function createPresentationJob(
  { concept, options }: PlanPresentationInput,
): Promise<S.PresentationJobCreated> {
  const cleanConcept = scrubPhi(concept).text;

  await logAudit({ action: "presentation.generate", scope: "/presentation-maker" });

  return api.post(
    "/api/presentation/jobs",
    { concept: cleanConcept, options },
    S.PresentationJobCreated,
  );
}

export async function getPresentationJob(jobId: string): Promise<S.PresentationJobState> {
  return api.get(`/api/presentation/jobs/${encodeURIComponent(jobId)}`, S.PresentationJobState);
}
