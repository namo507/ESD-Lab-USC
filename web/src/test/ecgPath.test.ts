import { describe, it, expect } from "vitest";
import { ecgPath } from "@/lib/ecgPath";

describe("ecgPath", () => {
  it("starts with M and contains L commands", () => {
    const d = ecgPath(60, 30, 1, "clean");
    expect(d.startsWith("M")).toBe(true);
    expect(d).toMatch(/L\d/);
  });

  it("is deterministic for same inputs", () => {
    expect(ecgPath(120, 32, 7, "clean")).toBe(ecgPath(120, 32, 7, "clean"));
  });

  it("renders distinct shapes per flag", () => {
    const clean = ecgPath(120, 32, 1, "clean");
    const noise = ecgPath(120, 32, 1, "noise");
    const flat = ecgPath(120, 32, 1, "flatline");
    expect(clean).not.toBe(noise);
    expect(clean).not.toBe(flat);
    expect(noise).not.toBe(flat);
  });

  it("clamps within height bounds", () => {
    const d = ecgPath(60, 30, 1, "noise");
    const ys = Array.from(d.matchAll(/[ML](\d+) (\S+)/g)).map((m) => Number(m[2]));
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(2);
      expect(y).toBeLessThanOrEqual(28);
    }
  });
});
