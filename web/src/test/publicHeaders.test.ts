import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");

describe("public dashboard metric headers", () => {
  it("forces the aggregate REDCap artifact to revalidate and disables MIME sniffing", () => {
    const block = headers.match(
      /^\/dashboard\/data\/dashboard_metrics\.json\n((?:[ \t]+[^\n]+\n?)*)/m,
    )?.[1] ?? "";

    expect(block).toMatch(/Cache-Control:\s*no-store, must-revalidate/i);
    expect(block).toMatch(/X-Content-Type-Options:\s*nosniff/i);
    expect(headers).not.toMatch(/^\/dashboard\/data\/dashboard_data\.json$/m);
  });
});
