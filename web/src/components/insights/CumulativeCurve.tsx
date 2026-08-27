import type { CdcLineSeries } from "./CdcStyleLine";
import { CdcStyleLine } from "./CdcStyleLine";

export function CumulativeCurve({ series, summary, yLabel }: { series: CdcLineSeries[]; summary?: string; yLabel?: string }) {
  return (
    <CdcStyleLine
      series={series}
      yLabel={yLabel ?? "% first sustained attention"}
      showCi={false}
      summary={summary ?? "Cumulative incidence of first sustained attention by CGA month"}
    />
  );
}
