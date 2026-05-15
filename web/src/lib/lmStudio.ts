/**
 * LM Studio client (OpenAI-compatible chat completions, streaming).
 *
 * The user already runs LM Studio locally. We never POST raw participant
 * text — every prompt is run through `scrubPhi` first.
 *
 * - Endpoint defaults to http://localhost:1234/v1 — overridable via
 *   `VITE_LMSTUDIO_URL`.
 * - Streams Server-Sent `data:` chunks for the typewriter effect.
 * - Aborts cleanly via AbortController so the panel can switch models / be
 *   torn down without leaking sockets.
 */
import { scrubPhi, type ScrubResult } from "./phiScrub";
import { logAudit } from "./audit";

const DEFAULT_ENDPOINT = (import.meta.env.VITE_LMSTUDIO_URL as string | undefined) ??
  "http://localhost:1234/v1";

const SYSTEM_PROMPT =
  "You are an analyst-facing assistant for the NANO Study (R01, ESD Lab, " +
  "University of South Carolina). The dashboard provides surrogate IDs " +
  "(NANO-####) and aggregate metrics only — never assume access to PHI. " +
  "Speak in clinical NANO terminology: HRV (RMSSD/SDNN/HF/pNN50), HDA phases, " +
  "ADOS-2 calibrated severity, Bayley-4, RSA via continuous wavelet transform, " +
  "Actiheart-5 1024 Hz ECG, HeRO HRC, DataVyu, dual-thermistor thermal " +
  "gradients, MICE imputation, latent growth curve models. Be terse.";

export interface LMRequest {
  prompt: string;
  signal?: AbortSignal;
}

export interface LMStreamEvent {
  delta: string;
  done: boolean;
}

export interface LMResult {
  scrub: ScrubResult;
  endpoint: string;
}

/**
 * Stream a prompt through LM Studio. The async iterator yields incremental
 * deltas suitable for typewriter rendering. Returns the scrub result so the
 * caller can render the redaction badge.
 */
export async function* streamCompletion(
  req: LMRequest,
): AsyncGenerator<LMStreamEvent, LMResult, void> {
  const scrub = scrubPhi(req.prompt);
  const endpoint = `${DEFAULT_ENDPOINT}/chat/completions`;
  void logAudit({
    action: "run.trigger",
    scope: "/agentic/lmstudio",
    detail: {
      endpoint,
      redactions: scrub.redactions.reduce((s, r) => s + r.count, 0),
      cleaned: scrub.cleaned,
    },
  });

  const res = await fetch(endpoint, {
    method: "POST",
    signal: req.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "local-model",
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: scrub.text },
      ],
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`LM Studio: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        yield { delta: "", done: true };
        return { scrub, endpoint };
      }
      try {
        const obj = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) yield { delta, done: false };
      } catch {
        // tolerate non-JSON keep-alive frames
      }
    }
  }
  return { scrub, endpoint };
}
