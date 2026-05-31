/**
 * HIPAA access logger.
 *
 * Real audit writes go server-side to `audit/hipaa_access.log`. The client
 * fires-and-forgets a POST to /api/audit on every navigation, epoch decision,
 * run trigger, and export. NEVER include PHI in the payload — only ids and
 * action verbs.
 */
import { z } from "zod";

const AuditEventSchema = z.object({
  ts: z.string(), // ISO timestamp
  action: z.enum([
    "route.navigate",
    "epoch.decision",
    "run.trigger",
    "run.stop",
    "export.csv",
    "export.pdf",
    "export.pptx",
    "presentation.generate",
    "auth.login",
    "auth.timeout",
  ]),
  scope: z.string().optional(), // e.g. "/qa/NANO-0102" — deid only
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export async function logAudit(event: Omit<AuditEvent, "ts">): Promise<void> {
  const payload = AuditEventSchema.parse({ ...event, ts: new Date().toISOString() });
  try {
    await fetch("/api/audit", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // best-effort only — surface to console in dev, swallow in prod
    if (import.meta.env.DEV) console.warn("audit log delivery failed", payload.action);
  }
}
