import { describe, it, expect } from "vitest";
import { scrubPhi } from "@/lib/phiScrub";

describe("scrubPhi", () => {
  it("preserves NANO surrogate ids", () => {
    const r = scrubPhi("Show RMSSD trajectory for NANO-0173.");
    expect(r.text).toContain("NANO-0173");
    expect(r.cleaned).toBe(false);
  });

  it("redacts ISO dates", () => {
    const r = scrubPhi("Visit on 2024-08-12 at 09:14");
    expect(r.text).toContain("{{REDACTED:DATE}}");
    expect(r.text).not.toContain("2024-08-12");
    expect(r.cleaned).toBe(true);
  });

  it("redacts US-style dates", () => {
    const r = scrubPhi("DOB 8/12/1992");
    expect(r.text).toContain("{{REDACTED:DATE}}");
    expect(r.cleaned).toBe(true);
  });

  it("redacts MRN strings", () => {
    const r = scrubPhi("mrn: 0099231");
    expect(r.text).toContain("{{REDACTED:MRN}}");
  });

  it("redacts SSN-style sequences", () => {
    const r = scrubPhi("SSN 123-45-6789 attached");
    expect(r.text).toContain("{{REDACTED:SSN}}");
  });

  it("redacts emails", () => {
    const r = scrubPhi("contact research@uofsc.edu for details");
    expect(r.text).toContain("{{REDACTED:EMAIL}}");
    expect(r.text).not.toContain("research@uofsc.edu");
  });

  it("redacts phone numbers", () => {
    const r1 = scrubPhi("call 803-555-1212");
    expect(r1.text).toContain("{{REDACTED:PHONE}}");
    const r2 = scrubPhi("call (803) 555-1212");
    expect(r2.text).toContain("{{REDACTED:PHONE}}");
  });

  it("redacts patient name pairs while preserving the role prefix", () => {
    const r = scrubPhi("patient Jane Doe arrived");
    expect(r.text).toMatch(/patient \{\{REDACTED:NAME\}\}/);
    expect(r.text).not.toContain("Jane Doe");
  });

  it("counts each redaction kind", () => {
    const r = scrubPhi("DOB 2024-01-01, mrn 11223344, email a@b.com");
    const map = Object.fromEntries(r.redactions.map(({ name, count }) => [name, count]));
    expect(map.DATE).toBeGreaterThanOrEqual(1);
    expect(map.MRN).toBe(1);
    expect(map.EMAIL).toBe(1);
  });

  it("returns cleaned=true only when something was redacted", () => {
    expect(scrubPhi("RMSSD over CGA looks normal").cleaned).toBe(false);
    expect(scrubPhi("DOB 2024-08-12").cleaned).toBe(true);
  });
});
