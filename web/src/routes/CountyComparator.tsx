/**
 * @route CountyComparator
 * @data-sensitivity: AGGREGATED - no PII
 * @auth-required: false (internal demo mode only)
 * @hipaa-note: County-level aggregates only. No addresses, ZIP codes, or participant-level location data present.
 */
import { useSearchParams } from "react-router-dom";
import { Card, SectionLabel } from "@/components/primitives";
import { CountyCard } from "@/components/comparison/CountyCard";
import { MirroredBarChart } from "@/components/comparison/MirroredBarChart";
import { useCountyProfiles, useSdohMap } from "@/api/hooks";
import type { CountyProfileRow, SdohMapRow } from "@/api/schemas";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { CountyMap } from "./SdohMap";
import shared from "./FeatureRoutes.module.css";
import styles from "./CountyComparator.module.css";

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function findProfile(rows: CountyProfileRow[], key: string | null, fallbackIndex: number): CountyProfileRow | undefined {
  if (!rows.length) return undefined;
  const normalized = key ? slug(key) : "";
  return rows.find((row) => slug(row.county) === normalized || row.fips === key) ?? rows[fallbackIndex] ?? rows[0];
}

function countyContext(left: CountyProfileRow | undefined, right: CountyProfileRow | undefined): string {
  if (!left || !right) return "County context will appear once both county profiles are available.";
  const completionDelta = (right.completionRate - left.completionRate) * 100;
  const sdohDelta = right.sdohScore - left.sdohScore;
  const completionPhrase = Math.abs(completionDelta) < 1
    ? "similar visit completion"
    : `${right.county} is ${Math.abs(completionDelta).toFixed(1)} percentage points ${completionDelta > 0 ? "higher" : "lower"} on visit completion`;
  const sdohPhrase = Math.abs(sdohDelta) < 0.03
    ? "with comparable SDoH scores"
    : `${right.county} has a ${sdohDelta > 0 ? "higher" : "lower"} SDoH burden score`;
  return `${left.county} and ${right.county} show ${completionPhrase}, ${sdohPhrase}. Treat these as planning context, not individual-family interpretation.`;
}

export function CountyComparator() {
  const enabled = useFeatureFlag("COUNTY_COMPARATOR");
  const [params, setParams] = useSearchParams();
  const profilesQuery = useCountyProfiles();
  const sdohQuery = useSdohMap();
  const profiles = profilesQuery.data?.data ?? [];
  const sdohRows = sdohQuery.data?.data ?? [];

  const left = findProfile(profiles, params.get("left"), 0);
  const right = findProfile(profiles, params.get("right"), 1);

  function update(side: "left" | "right", county: CountyProfileRow | SdohMapRow) {
    const next = new URLSearchParams(params);
    next.set(side, slug(county.county));
    setParams(next, { replace: true });
  }

  const metrics = left && right ? [
    { label: "Enrolled", left: left.enrolled, right: right.enrolled, format: (v: number) => v.toFixed(0) },
    { label: "Completion", left: left.completionRate * 100, right: right.completionRate * 100, format: (v: number) => `${v.toFixed(1)}%` },
    { label: "SDoH score", left: left.sdohScore, right: right.sdohScore, format: (v: number) => v.toFixed(2) },
    { label: "CPTd gap", left: left.cptdGapMean ?? 0, right: right.cptdGapMean ?? 0, format: (v: number) => `${v.toFixed(1)} C` },
  ] : [];

  if (!enabled) return null;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>CDC-style comparison</span>
          <h1 className={shared.h1}>County Comparator</h1>
          <p className={shared.lede}>Compare county-level enrollment, completion, SDoH, and CPTd context without exposing precise family locations.</p>
        </div>
      </header>

      {(profilesQuery.isLoading || sdohQuery.isLoading) && <div className={shared.alert}>Loading county aggregates...</div>}
      {(profilesQuery.isError || sdohQuery.isError) && <div className={shared.alert}>Unable to load data - check pipeline status</div>}

      <div className={styles.columns}>
        {(["left", "right"] as const).map((side) => {
          const profile = side === "left" ? left : right;
          return (
            <div key={side} className={styles.countyPanel}>
              <Card pad={14}>
                <div className={styles.selectRow}>
                  <label className={styles.selectLabel} htmlFor={`county-${side}`}>{side} county</label>
                  <select
                    id={`county-${side}`}
                    className={styles.select}
                    value={profile?.fips ?? ""}
                    onChange={(event) => {
                      const next = profiles.find((row) => row.fips === event.target.value);
                      if (next) update(side, next);
                    }}
                  >
                    {profiles.map((row) => <option key={row.fips} value={row.fips}>{row.county}</option>)}
                  </select>
                </div>
              </Card>
              <Card pad={0}>
                <CountyMap
                  rows={sdohRows}
                  selectedCounty={profile?.fips}
                  onCountySelect={(county) => update(side, county)}
                  ariaLabel={`${side} county selector map`}
                />
              </Card>
              <CountyCard profile={profile} side={side} />
            </div>
          );
        })}
      </div>

      <Card pad={20}>
        <SectionLabel>Mirrored metrics</SectionLabel>
        <h2 className={shared.cardTitle}>Side-by-side county context</h2>
        {metrics.length ? (
          <MirroredBarChart
            metrics={metrics}
            leftLabel={left?.county ?? "Left"}
            rightLabel={right?.county ?? "Right"}
            summary={`County comparison between ${left?.county ?? "left county"} and ${right?.county ?? "right county"}`}
          />
        ) : (
          <p className={shared.muted}>No data available for this filter combination</p>
        )}
      </Card>

      <div className={styles.context} data-insight="county-context">
        <strong style={{ color: "var(--ink)" }}>County Context: </strong>
        {countyContext(left, right)}
      </div>
    </div>
  );
}
