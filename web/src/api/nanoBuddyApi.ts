import type { AssistantStatus } from "@/api/chatApi";
import { scrubPhi } from "@/lib/phiScrub";

export interface NanoBuddyCitation {
  title: string;
  path: string;
  loc: string;
}

export interface NanoBuddyResponse {
  answer: string;
  citations: NanoBuddyCitation[];
  usedMetrics: string[];
  refused: boolean;
}

interface NanoBuddyWireResponse {
  answer?: unknown;
  citations?: unknown;
  used_metrics?: unknown;
  refused?: unknown;
  error?: unknown;
}

interface NanoBuddyStatusWireResponse {
  state?: unknown;
  ready?: unknown;
  model_id?: unknown;
}

const NANO_BUDDY_ENDPOINT = "/api/buddy";
const REPOSITORY_DOCUMENT_BASE = "https://github.com/namo507/ESD-Lab-USC/blob/main/";
const STUDY_ID_PATTERN = /\b(?:ANONICO|NANO|NICO|ASIB|VPT|PT|TD)[-_ ]?\d{1,8}\b/gi;
const SHARED_REDACTION_PATTERN = /\{\{REDACTED:[A-Z_]+\}\}/g;
const CITATION_ROOTS = [
  "docs/",
  "esd-lab-readings/",
  "ESD Lab readings/",
  "dashboard/context_skill/references/",
] as const;
const CITATION_SUFFIXES = new Set([".md", ".txt", ".rst", ".pdf"]);

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function citations(value: unknown): NanoBuddyCitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    if (typeof row.title !== "string" || typeof row.path !== "string") return [];
    return [{
      title: row.title.trim() || row.path,
      path: row.path.trim(),
      loc: typeof row.loc === "string" ? row.loc.trim() : "document",
    }];
  });
}

function errorMessage(payload: NanoBuddyWireResponse, status: number): string {
  if (status >= 400 && status < 500 && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  return "ESD Buddy is temporarily unavailable. Please try again.";
}

export async function askNanoBuddy(
  message: string,
  signal?: AbortSignal,
): Promise<NanoBuddyResponse> {
  const cleanMessage = scrubNanoBuddyMessage(message);
  const response = await fetch(NANO_BUDDY_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ message: cleanMessage, context: { section: "nano" } }),
    signal,
  });

  let payload: NanoBuddyWireResponse;
  try {
    payload = await response.json() as NanoBuddyWireResponse;
  } catch {
    throw new Error("ESD Buddy returned an invalid response. Please try again.");
  }

  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  if (typeof payload.answer !== "string" || !payload.answer.trim()) {
    throw new Error("ESD Buddy returned an empty response. Please try again.");
  }

  return {
    answer: payload.answer.trim(),
    citations: citations(payload.citations),
    usedMetrics: Array.isArray(payload.used_metrics)
      ? payload.used_metrics.filter((value): value is string => typeof value === "string")
      : [],
    refused: payload.refused === true,
  };
}

export function scrubNanoBuddyMessage(message: string): string {
  return scrubPhi(message).text
    .replace(SHARED_REDACTION_PATTERN, "{{REDACTED:PHI}}")
    .replace(STUDY_ID_PATTERN, "{{REDACTED:PHI}}");
}

export async function fetchNanoBuddyStatus(signal?: AbortSignal): Promise<AssistantStatus> {
  const response = await fetch(NANO_BUDDY_ENDPOINT, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("ESD Buddy status is temporarily unavailable.");

  let payload: NanoBuddyStatusWireResponse;
  try {
    payload = await response.json() as NanoBuddyStatusWireResponse;
  } catch {
    throw new Error("ESD Buddy returned an invalid status response.");
  }

  const ready = payload.ready === true;
  const status: AssistantStatus["status"] = ready
    ? "ready"
    : payload.state === "degraded"
      ? "degraded"
      : "error";
  return {
    status,
    error: ready ? null : "Aggregate metrics and document lookup are temporarily limited.",
    model: typeof payload.model_id === "string" && payload.model_id.trim()
      ? payload.model_id.trim()
      : null,
  };
}

export function nanoBuddyCitationHref(citation: NanoBuddyCitation): string | null {
  if (hasControlCharacters(citation.path)) return null;
  const path = citation.path.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = path.split("/");
  if (!path || parts.some((part) => !part || part === "." || part === "..")) return null;
  if (!CITATION_ROOTS.some((root) => path.startsWith(root))) return null;
  const filename = parts.at(-1) ?? "";
  const extensionIndex = filename.lastIndexOf(".");
  const suffix = extensionIndex >= 0 ? filename.slice(extensionIndex).toLowerCase() : "";
  if (!CITATION_SUFFIXES.has(suffix)) return null;
  return `${REPOSITORY_DOCUMENT_BASE}${parts.map(encodeURIComponent).join("/")}`;
}
