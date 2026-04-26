/**
 * Deterministic ECG-like signal generator for UI previews.
 * Verbatim port of `ecgPath` from the design-system primitives.
 *
 * NEVER plot real PHI on the client; this is for skeleton tiles only.
 * Real signals must come server-side as signed-URL PNG/SVG.
 */
export type EcgFlag = "clean" | "ectopic" | "motion" | "noise" | "flatline";

export function ecgPath(
  width = 120,
  height = 32,
  seed = 1,
  flag: EcgFlag = "clean",
): string {
  const beats =
    flag === "flatline" ? 0 : flag === "noise" ? 24 : 4 + (seed % 3);
  const beatW = beats > 0 ? width / beats : width;
  const pts: Array<[number, number]> = [];

  for (let x = 0; x <= width; x += 1) {
    let y = height / 2;

    if (flag === "flatline") {
      y += Math.sin(x * 0.5 + seed) * 0.4;
    } else if (flag === "noise") {
      y +=
        (Math.sin(x * 0.7 + seed) + Math.sin(x * 1.3 + seed * 2)) * 6 +
        (((x * 9301 + seed * 49297) % 233280) / 233280 - 0.5) * 8;
    } else if (flag === "motion") {
      const phase = (x % beatW) / beatW;
      y -= Math.sin(phase * Math.PI * 2) * 4;
      y += Math.sin(x * 0.2 + seed) * 5;
    } else {
      const phase = (x % beatW) / beatW;
      let bump = 0;
      if (phase > 0.42 && phase < 0.5) bump = -((phase - 0.42) / 0.08) * 4;
      else if (phase >= 0.5 && phase < 0.55)
        bump = ((phase - 0.5) / 0.05) * (height * 0.45) - 4;
      else if (phase >= 0.55 && phase < 0.62)
        bump = ((0.62 - phase) / 0.07) * (height * 0.45);
      else if (phase >= 0.7 && phase < 0.82)
        bump = -Math.sin((phase - 0.7) / 0.12 * Math.PI) * 3;
      y -= bump;
      if (
        flag === "ectopic" &&
        Math.floor(x / beatW) % 3 === 1 &&
        phase > 0.45 &&
        phase < 0.6
      ) {
        y -= 4;
      }
    }
    pts.push([x, Math.max(2, Math.min(height - 2, y))]);
  }

  return pts
    .map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1].toFixed(1))
    .join(" ");
}
