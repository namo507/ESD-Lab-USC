export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i += 1) {
    meanA += a[i] ?? 0;
    meanB += b[i] ?? 0;
  }
  meanA /= n;
  meanB /= n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : Math.max(-1, Math.min(1, num / den));
}

export function lagShift(series: number[], lag: number): number[] {
  if (lag === 0) return series.slice();
  if (lag > 0) return Array.from({ length: series.length }, (_, i) => series[i - lag] ?? Number.NaN);
  const offset = Math.abs(lag);
  return Array.from({ length: series.length }, (_, i) => series[i + offset] ?? Number.NaN);
}

function pairedWindow(a: number[], b: number[], start: number, windowSamples: number, lag: number) {
  const aa: number[] = [];
  const bb: number[] = [];
  for (let j = 0; j < windowSamples; j += 1) {
    const ai = start + j;
    const bi = ai - lag;
    const av = a[ai];
    const bv = b[bi];
    if (Number.isFinite(av) && Number.isFinite(bv)) {
      aa.push(av as number);
      bb.push(bv as number);
    }
  }
  return [aa, bb] as const;
}

export function windowedCrossCorrelation(
  a: number[],
  b: number[],
  maxLagSamples: number,
  windowSamples: number,
  stepSamples: number,
): number[][] {
  const n = Math.min(a.length, b.length);
  const rows: number[][] = [];
  if (n < 2 || windowSamples < 2 || stepSamples < 1) return rows;

  for (let start = 0; start + windowSamples <= n; start += stepSamples) {
    const row: number[] = [];
    for (let lag = -maxLagSamples; lag <= maxLagSamples; lag += 1) {
      const [wa, wb] = pairedWindow(a, b, start, windowSamples, lag);
      row.push(wa.length >= 3 ? pearson(wa, wb) : 0);
    }
    rows.push(row);
  }
  return rows;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sorted[base] ?? sorted[0] ?? 0;
  const hi = sorted[base + 1] ?? lo;
  return lo + rest * (hi - lo);
}

export function peristimulusAverage(
  series: number[],
  eventOnsets: number[],
  preSamples: number,
  postSamples: number,
) {
  const windowLength = preSamples + postSamples + 1;
  const windows = eventOnsets
    .map((onset) =>
      Array.from({ length: windowLength }, (_, i) => series[onset - preSamples + i]),
    )
    .filter((window): window is number[] => window.every((v) => Number.isFinite(v)));

  const mean = Array.from({ length: windowLength }, (_, i) => {
    const values = windows.map((window) => window[i] ?? 0);
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  });

  const lo = Array.from({ length: windowLength }, (_, i) => quantile(windows.map((window) => window[i] ?? 0), 0.025));
  const hi = Array.from({ length: windowLength }, (_, i) => quantile(windows.map((window) => window[i] ?? 0), 0.975));

  return { mean, lo, hi, n: windows.length };
}

export function phaseBin2D(x: number[], y: number[], bins: number): number[][] {
  const n = Math.min(x.length, y.length);
  const grid = Array.from({ length: bins }, () => Array.from({ length: bins }, () => 0));
  if (n === 0 || bins <= 0) return grid;

  const minX = Math.min(...x.slice(0, n));
  const maxX = Math.max(...x.slice(0, n));
  const minY = Math.min(...y.slice(0, n));
  const maxY = Math.max(...y.slice(0, n));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  for (let i = 0; i < n; i += 1) {
    const xi = Math.max(0, Math.min(bins - 1, Math.floor((((x[i] ?? minX) - minX) / rangeX) * bins)));
    const yi = Math.max(0, Math.min(bins - 1, Math.floor((((y[i] ?? minY) - minY) / rangeY) * bins)));
    grid[yi]![xi]! += 1;
  }

  return grid;
}
