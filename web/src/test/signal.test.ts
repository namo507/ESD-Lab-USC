import { describe, expect, it } from "vitest";
import { lagShift, pearson, peristimulusAverage, phaseBin2D, windowedCrossCorrelation } from "@/lib/signal";

describe("signal utilities", () => {
  it("computes pearson correlation and lag shifts", () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(lagShift([1, 2, 3, 4], 1)).toEqual([Number.NaN, 1, 2, 3]);
    expect(lagShift([1, 2, 3, 4], -1)).toEqual([2, 3, 4, Number.NaN]);
  });

  it("finds the expected lag in windowed cross-correlation", () => {
    const caregiver = Array.from({ length: 80 }, (_, i) => Math.sin(i / 5));
    const infant = Array.from({ length: 80 }, (_, i) => Math.sin((i - 2) / 5));
    const corr = windowedCrossCorrelation(caregiver, infant, 4, 32, 16);
    const first = corr[0] ?? [];
    const best = first.reduce((acc, value, index) => (value > acc.value ? { value, index } : acc), { value: -Infinity, index: 0 });
    expect(best.index - 4).toBe(-2);
  });

  it("computes event-locked averages and phase occupancy bins", () => {
    const series = [1, 1, 2, 3, 4, 1, 1, 2, 3, 4];
    const avg = peristimulusAverage(series, [2, 7], 1, 2);
    expect(avg.n).toBe(2);
    expect(avg.mean).toEqual([1, 2, 3, 4]);

    const grid = phaseBin2D([0, 0.5, 1], [0, 0.5, 1], 3);
    expect(grid.flat().reduce((sum, value) => sum + value, 0)).toBe(3);
  });
});
