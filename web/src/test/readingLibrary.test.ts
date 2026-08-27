import { describe, expect, it } from "vitest";
import { READING_CORPUS } from "@/data/readingLibrary";

/**
 * Guards the build-time corpus index that powers the landing reading-library
 * metric graphs. If `lab-readings.json` (the index of esd-lab-readings/) ever
 * drifts in shape, these assertions fail before the landing renders bad graphs.
 */
describe("reading library corpus", () => {
  it("derives non-empty totals from the indexed manifest", () => {
    expect(READING_CORPUS.totalReadings).toBeGreaterThan(0);
    expect(READING_CORPUS.totalPages).toBeGreaterThan(0);
    expect(READING_CORPUS.sourceCount).toBeGreaterThan(0);
    expect(READING_CORPUS.bySource.length).toBeGreaterThan(0);
    expect(READING_CORPUS.readings.length).toBe(READING_CORPUS.totalReadings);
  });

  it("keeps every breakdown summing back to the reading total", () => {
    const sumCounts = (bars: Array<{ count: number }>) => bars.reduce((s, b) => s + b.count, 0);
    expect(sumCounts(READING_CORPUS.bySource)).toBe(READING_CORPUS.totalReadings);
    expect(sumCounts(READING_CORPUS.byYear)).toBe(READING_CORPUS.totalReadings);
    expect(sumCounts(READING_CORPUS.depthBuckets)).toBe(READING_CORPUS.totalReadings);
  });

  it("ranks indexed terms by frequency without noise tokens", () => {
    const terms = READING_CORPUS.topKeywords.map((k) => k.term);
    expect(terms).not.toContain("the");
    expect(terms.every((t) => t.length >= 4)).toBe(true);
    const counts = READING_CORPUS.topKeywords.map((k) => k.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
});
