/**
 * Browser-side PHI scrubber. Runs *before* any LLM request leaves the page.
 * Server is the authority — this is defense-in-depth so a copy/paste prompt
 * never carries an MRN, name, DOB, or full date that wasn't already a
 * surrogate id.
 *
 * Patterns are conservative — false positives are preferred over false
 * negatives. A redacted token preserves the field name so the LLM still has
 * structural context (e.g., `{{REDACTED:DATE}}` vs `2024-08-12`).
 *
 * Tested in src/test/phiScrub.test.ts.
 */
const PATTERNS: Array<{ name: string; re: RegExp }> = [
  // ISO + US-style dates — always redact
  { name: "DATE", re: /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?\b/g },
  { name: "DATE", re: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g },
  // MRN: 6+ digit string adjacent to "mrn"
  { name: "MRN",  re: /\bmrn[:\s#]*\d{4,12}\b/gi },
  // Phone numbers
  { name: "PHONE", re: /\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  // SSN-style
  { name: "SSN",  re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // Email
  { name: "EMAIL", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // First/last name pairs (Title-cased pair) — rough heuristic, only when
  // adjacent to "patient", "infant", "caregiver"
  {
    name: "NAME",
    re: /\b(patient|infant|caregiver|mother|father)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g,
  },
];

export interface ScrubResult {
  text: string;
  redactions: Array<{ name: string; count: number }>;
  cleaned: boolean;
}

/**
 * Scrub `input` of likely PHI. Surrogate `NANO-####` ids are explicitly
 * preserved — they're the entire point of the de-identified pipeline.
 */
export function scrubPhi(input: string): ScrubResult {
  let text = input;
  const counts = new Map<string, number>();

  for (const { name, re } of PATTERNS) {
    text = text.replace(re, (match, ...rest) => {
      // Skip surrogate ids and anything that already looks like NANO-####
      if (/^NANO-\d{4}$/i.test(match)) return match;
      counts.set(name, (counts.get(name) ?? 0) + 1);
      // Preserve "patient/infant" prefix on NAME match for downstream context
      if (name === "NAME" && rest.length >= 1) {
        const prefix = String(rest[0]);
        return `${prefix} {{REDACTED:NAME}}`;
      }
      return `{{REDACTED:${name}}}`;
    });
  }

  const redactions = Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  return { text, redactions, cleaned: redactions.length > 0 };
}
