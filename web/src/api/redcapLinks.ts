/**
 * Deep links from a study to its REDCap projects.
 *
 * The origin is build-time configuration (`VITE_REDCAP_APP_ORIGIN`) rather
 * than something derived at runtime, because the canonical Pages deployment is
 * a static site with no backend to ask. When it is unset, callers get an empty
 * list and render nothing -- a dead link is worse than no link.
 *
 * Links point at project home only: `/index.php?pid=<project_id>`. That form
 * was verified against redcap.research.sc.edu, where the version-prefixed
 * `redcap_vNN.N.N` paths return 404. No record identifier, participant field,
 * or API token ever appears in a URL, which keeps the browser inside the same
 * aggregate-only posture as the rest of the dashboard.
 */
import type { DashboardMetrics, DashboardProjectMetrics } from "./dashboardMetrics";

export interface RedcapProjectLink {
  /** Stable project key from the payload, e.g. `nano_surveys`. */
  key: string;
  /** REDCap project title, used as the visible link text. */
  title: string;
  projectId: number;
  /** Absolute URL to the project home page. */
  href: string;
  /** `surveys`, `assessments`, `combined` — shown as a small qualifier. */
  role: string | null;
  /** True when this project is the study's enrollment authority. */
  enrollmentAuthority: boolean;
  /** False when the last sync for this project failed. */
  healthy: boolean;
}

/** Read the configured REDCap origin, or null when the build has none. */
export function redcapOrigin(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<
    string,
    string | undefined
  >,
): string | null {
  const raw = (env.VITE_REDCAP_APP_ORIGIN ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Only ever link out over HTTPS; REDCap holds PHI behind its login.
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Build the project-home URL for one REDCap project id. */
export function redcapProjectUrl(origin: string, projectId: number): string {
  return `${origin.replace(/\/+$/, "")}/index.php?pid=${projectId}`;
}

function toLink(
  origin: string,
  project: DashboardProjectMetrics,
): RedcapProjectLink | null {
  if (project.projectId === null) return null;
  return {
    key: project.key,
    title: project.title ?? project.key,
    projectId: project.projectId,
    href: redcapProjectUrl(origin, project.projectId),
    role: project.role,
    enrollmentAuthority: project.enrollmentAuthority,
    healthy: project.status !== "error" && project.errorCode === null,
  };
}

/**
 * Resolve the REDCap projects behind a study scope.
 *
 * `studyKey` of `"ALL"` (case-insensitive) returns every configured project,
 * which is what the portfolio scope should offer. An unknown study returns an
 * empty list rather than falling back to everything, so a typo cannot
 * accidentally surface unrelated projects.
 */
export function redcapLinksForStudy(
  metrics: DashboardMetrics | null | undefined,
  studyKey: string,
  origin: string | null = redcapOrigin(),
): RedcapProjectLink[] {
  if (!origin || !metrics) return [];

  const scope = studyKey.trim().toLowerCase();
  const projects = metrics.projects.filter((project) =>
    scope === "all" ? true : project.study === scope,
  );

  return projects
    .map((project) => toLink(origin, project))
    .filter((link): link is RedcapProjectLink => link !== null)
    // Enrollment authority first: it is the project a coordinator usually wants.
    .sort((a, b) => {
      if (a.enrollmentAuthority !== b.enrollmentAuthority) {
        return a.enrollmentAuthority ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
}
