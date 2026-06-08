import type { CdcLineSeries } from "./CdcStyleLine";
import { CdcStyleLine } from "./CdcStyleLine";

export function CumulativeCurve({ series, summary }: { series: CdcLineSeries[]; summary?: string }) {
  return (
    <CdcStyleLine
      series={series}
      yLabel="% first sustained attention"
      showCi={false}
      summary={summary ?? "Cumulative incidence of first sustained attention by CGA month"}
    />
  );
}
