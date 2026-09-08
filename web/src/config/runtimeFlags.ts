export interface RuntimeFlags {
  DEV?: boolean;
  VITE_LIVE_ASSISTANT?: unknown;
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/**
 * Development-only hint used when the frontend can load but /api is unreachable.
 * Returns null when no warning should be shown.
 */
export function devBackendPreflightReason(flags: RuntimeFlags): string | null {
  if (!flags.DEV) return null;
  if (isTruthyFlag(flags.VITE_LIVE_ASSISTANT)) return null;
  return "Live assistant backend is unreachable. Start the dashboard service at http://127.0.0.1:8080 or set VITE_API_PROXY_TARGET.";
}
