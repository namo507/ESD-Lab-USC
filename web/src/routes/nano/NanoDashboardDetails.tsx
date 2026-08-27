import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import {
  nanoRedcapIndicator,
  type NanoDashboardData,
  type NullableNumber,
} from "@/api/nanoDashboardData";
import { useUi } from "@/store/ui";
import styles from "./NanoDashboardDetails.module.css";

export interface NanoDashboardDetailsProps {
  data: NanoDashboardData;
}

type Tone = "blue" | "sky" | "green" | "amber" | "neutral";

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function numberText(value: NullableNumber, decimals = 0): string {
  if (value === null || !Number.isFinite(value)) return "Awaiting data";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function percentText(value: NullableNumber, decimals = 1): string {
  return value === null ? "Awaiting data" : `${numberText(value, decimals)}%`;
}

function signedNumberText(value: NullableNumber): string {
  if (value === null) return "Awaiting data";
  return `${value > 0 ? "+" : ""}${INTEGER_FORMATTER.format(value)}`;
}

function sumKnown(values: NullableNumber[]): NullableNumber {
  if (!values.length || values.some((value) => value === null || !Number.isFinite(value))) return null;
  return (values as number[]).reduce((total, value) => total + value, 0);
}

function ratioPercent(numerator: NullableNumber, denominator: NullableNumber): NullableNumber {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function humanize(value: string): string {
  const acronyms: Record<string, string> = {
    api: "API",
    citi: "CITI",
    cptd: "cPTd",
    dua: "DUA",
    ecg: "ECG",
    hda: "HDA",
    irb: "IRB",
    nicu: "NICU",
    ok: "OK",
    qc: "QC",
    redcap: "REDCap",
    rsa: "RSA",
    shap: "SHAP",
    sop: "SOP",
  };
  return value
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => acronyms[word.toLowerCase()] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function dateText(value: string | null, includeTime = false): string {
  if (!value) return "Awaiting data";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: dateOnly ? "UTC" : "America/New_York",
  }).format(parsed);
}

function booleanText(value: boolean | null, yes = "Ready", no = "Needs attention"): string {
  if (value === null) return "Awaiting data";
  return value ? yes : no;
}

function safeLibraryHref(value: string | null): string | null {
  if (value?.startsWith("/") || value?.startsWith("https://") || value?.startsWith("http://")) {
    return value;
  }
  return null;
}

function candidateString(candidate: Record<string, unknown>, key: string): string | null {
  const value = candidate[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
}

function StatusChip({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`${styles.chip} ${styles[`tone${humanize(tone)}`]}`}>{children}</span>;
}

function SectionHeading({
  eyebrow,
  title,
  headingId,
  intro,
  headline,
  headlineLabel,
}: {
  eyebrow: string;
  title: string;
  headingId: string;
  intro: string;
  headline: ReactNode;
  headlineLabel: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2 id={headingId}>{title}</h2>
        <p>{intro}</p>
      </div>
      <div className={styles.headlineMetric} aria-label={`${headlineLabel}: ${String(headline)}`}>
        <strong>{headline}</strong>
        <span>{headlineLabel}</span>
      </div>
    </div>
  );
}

function SupportCard({
  label,
  value,
  note,
  tone = "neutral",
  children,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: Tone;
  children?: ReactNode;
}) {
  return (
    <article className={`${styles.supportCard} ${styles[`tone${humanize(tone)}`]}`}>
      <span className={styles.supportLabel}>{label}</span>
      <strong className={styles.supportValue}>{value}</strong>
      {note ? <span className={styles.supportNote}>{note}</span> : null}
      {children}
    </article>
  );
}

function EmptyRow({ colSpan, label = "No aggregate records are available yet." }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td className={styles.emptyCell} colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function DetailTable({
  caption,
  headings,
  children,
}: {
  caption: string;
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div className={styles.tableRegion}>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label={`${caption}. Scroll horizontally for more columns.`}
        tabIndex={0}
      >
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      <span className={styles.scrollCue} aria-hidden="true">Scroll horizontally for more columns</span>
    </div>
  );
}

function EnrollmentSection({ data }: NanoDashboardDetailsProps) {
  const enrollmentProgress = ratioPercent(data.enrollment.enrolled, data.enrollment.target);
  const cohortGroups = data.enrollment.byGroup.length || null;
  const reportingSites = data.enrollment.bySite.length || null;
  const reportingCoverage = cohortGroups === null || reportingSites === null
    ? "Awaiting data"
    : `${INTEGER_FORMATTER.format(cohortGroups)} / ${INTEGER_FORMATTER.format(reportingSites)}`;

  return (
    <section className={styles.detailSection} id="cohort" aria-labelledby="cohort-heading">
      <SectionHeading
        eyebrow="Cohort"
        title="Enrollment and cohort"
        headingId="cohort-heading"
        intro="Aggregate recruitment and follow-up coverage across study groups and reporting sites."
        headline={numberText(data.enrollment.enrolled)}
        headlineLabel={data.enrollment.target === null ? "enrolled" : `of ${numberText(data.enrollment.target)} enrolled`}
      />
      <div className={styles.supportGrid}>
        <SupportCard label="Enrollment progress" value={percentText(enrollmentProgress)} note="Enrolled against study target" tone="blue">
          {enrollmentProgress === null ? (
            <progress aria-label="Enrollment progress awaiting data" max={100} />
          ) : (
            <progress aria-label="Enrollment progress" max={100} value={Math.min(100, enrollmentProgress)} />
          )}
        </SupportCard>
        <SupportCard label="Active follow-up" value={numberText(data.enrollment.active)} note="Aggregate active cohort" tone="sky" />
        <SupportCard label="Retention" value={percentText(data.enrollment.retentionPct)} note="Current cohort retention" tone="green" />
        <SupportCard
          label="Reporting coverage"
          value={reportingCoverage}
          note="Cohort groups / sites"
          tone="neutral"
        />
      </div>
      <details className={styles.disclosure}>
        <summary>View cohort details</summary>
        <div className={styles.detailTables}>
          <DetailTable caption="Enrollment by study group" headings={["Study group", "Enrolled", "Target", "Progress"]}>
            {data.enrollment.byGroup.length ? data.enrollment.byGroup.map((group) => (
              <tr key={group.group}>
                <th scope="row">{group.group}</th>
                <td>{numberText(group.enrolled)}</td>
                <td>{numberText(group.target)}</td>
                <td>
                  <span className={styles.progressCell}>{percentText(ratioPercent(group.enrolled, group.target))}</span>
                  <progress
                    aria-label={`${group.group} enrollment progress`}
                    max={100}
                    value={ratioPercent(group.enrolled, group.target) === null
                      ? undefined
                      : Math.min(100, ratioPercent(group.enrolled, group.target)!)}
                  />
                </td>
              </tr>
            )) : <EmptyRow colSpan={4} />}
          </DetailTable>
          <DetailTable caption="Recruitment funnel" headings={["Stage", "Aggregate count"]}>
            {data.enrollment.funnel.length ? data.enrollment.funnel.map((stage) => (
              <tr key={stage.stage}>
                <th scope="row">{stage.stage}</th>
                <td>{numberText(stage.count)}</td>
              </tr>
            )) : <EmptyRow colSpan={2} />}
          </DetailTable>
          <DetailTable caption="Gestational age strata" headings={["Stratum", "Aggregate count"]}>
            {data.enrollment.byGaStratum.length ? data.enrollment.byGaStratum.map((stratum) => (
              <tr key={stratum.label}>
                <th scope="row">{humanize(stratum.label)}</th>
                <td>{numberText(stratum.count)}</td>
              </tr>
            )) : <EmptyRow colSpan={2} />}
          </DetailTable>
          <DetailTable caption="Enrollment by site" headings={["Site", "Aggregate count"]}>
            {data.enrollment.bySite.length ? data.enrollment.bySite.map((site) => (
              <tr key={site.label}>
                <th scope="row">{site.label}</th>
                <td>{numberText(site.count)}</td>
              </tr>
            )) : <EmptyRow colSpan={2} />}
          </DetailTable>
        </div>
      </details>
    </section>
  );
}

function ScheduleSection({ data }: NanoDashboardDetailsProps) {
  const due = sumKnown(data.schedule.map((timepoint) => timepoint.due));
  const upcoming = sumKnown(data.schedule.map((timepoint) => timepoint.upcoming14d));
  const overdue = sumKnown(data.schedule.map((timepoint) => timepoint.overdue));
  const completed = sumKnown(data.schedule.map((timepoint) => timepoint.completed));

  return (
    <section className={styles.detailSection} id="schedule" aria-labelledby="schedule-heading">
      <SectionHeading
        eyebrow="Visits"
        title="Visit schedule tracker"
        headingId="schedule-heading"
        intro="A concise workload view for upcoming windows, overdue visits, and aggregate completion."
        headline={numberText(overdue)}
        headlineLabel="visits overdue"
      />
      <div className={styles.supportGrid}>
        <SupportCard label="Due now" value={numberText(due)} note="Across all tracked timepoints" tone="amber" />
        <SupportCard label="Next 14 days" value={numberText(upcoming)} note="Visits entering a study window" tone="sky" />
        <SupportCard label="Overdue" value={numberText(overdue)} note="Visits outside the current window" tone={overdue !== null && overdue > 0 ? "amber" : "green"} />
        <SupportCard label="Completed" value={numberText(completed)} note="Aggregate visits completed" tone="blue" />
      </div>
      <details className={styles.disclosure}>
        <summary>View visit schedule details</summary>
        <DetailTable caption="Visit schedule by timepoint" headings={["Timepoint", "Due", "Next 14 days", "Overdue", "Completed", "Window adherence"]}>
          {data.schedule.length ? data.schedule.map((timepoint) => (
            <tr key={timepoint.id}>
              <th scope="row">{humanize(timepoint.id)}</th>
              <td>{numberText(timepoint.due)}</td>
              <td>{numberText(timepoint.upcoming14d)}</td>
              <td>{numberText(timepoint.overdue)}</td>
              <td>{numberText(timepoint.completed)}</td>
              <td>{percentText(timepoint.windowAdherencePct)}</td>
            </tr>
          )) : <EmptyRow colSpan={6} />}
        </DetailTable>
      </details>
    </section>
  );
}

function PipelineSection({ data }: NanoDashboardDetailsProps) {
  const firstStage = data.pipeline.at(0);
  const modelReadyStage = data.pipeline.find((stage) => /^model[-\s]?ready$/i.test(stage.stage.trim()));

  return (
    <section className={styles.detailSection} id="pipeline-details" aria-labelledby="pipeline-details-heading">
      <SectionHeading
        eyebrow="Quality"
        title="Data pipeline and QC"
        headingId="pipeline-details-heading"
        intro="Session flow from ingestion through model readiness, with quality gates kept visible."
        headline={numberText(modelReadyStage?.count ?? null)}
        headlineLabel="model-ready sessions"
      />
      <div className={styles.supportGrid}>
        <SupportCard label={firstStage?.stage ?? "Pipeline input"} value={numberText(firstStage?.count ?? null)} note="Aggregate sessions entering the pipeline" tone="sky" />
        <SupportCard label="Model-ready" value={numberText(modelReadyStage?.count ?? null)} note="Aggregate sessions ready for modeling" tone="blue" />
        <SupportCard label="Model-ready 7-day movement" value={signedNumberText(modelReadyStage?.delta7d ?? null)} note="Exact Model-ready stage only" tone="green" />
        <SupportCard label="Open QC actions" value={numberText(data.checklists.openQcActions)} note="Aggregate actions awaiting resolution" tone={data.checklists.openQcActions !== null && data.checklists.openQcActions > 0 ? "amber" : "green"} />
      </div>
      <details className={styles.disclosure}>
        <summary>View pipeline and QC details</summary>
        <DetailTable caption="Aggregate pipeline stages and quality status" headings={["Pipeline stage", "Count", "7-day change", "QC pass", "QA passed"]}>
          {data.pipeline.length ? data.pipeline.map((stage) => (
            <tr key={stage.stage}>
              <th scope="row">{stage.stage}</th>
              <td>{numberText(stage.count)}</td>
              <td>{signedNumberText(stage.delta7d)}</td>
              <td>{percentText(stage.qcPassPct)}</td>
              <td>{numberText(stage.qaPassed)}</td>
            </tr>
          )) : <EmptyRow colSpan={5} />}
        </DetailTable>
      </details>
    </section>
  );
}

function ResearchSection({ data }: NanoDashboardDetailsProps) {
  return (
    <section className={styles.detailSection} id="research" aria-labelledby="research-heading">
      <SectionHeading
        eyebrow="Research"
        title="Autonomic and attention metrics"
        headingId="research-heading"
        intro="Aggregate developmental signals across attention phases, visit windows, study groups, RSA, and central-to-peripheral temperature gradients (cPTd)."
        headline={percentText(data.attention.hdaSustainedPct)}
        headlineLabel="sustained attention"
      />
      <div className={styles.supportGrid}>
        <SupportCard label="Sustained attention" value={percentText(data.attention.hdaSustainedPct)} note="Current aggregate HDA phase share" tone="blue" />
        <SupportCard label="Heart-rate deceleration" value={data.attention.hdaQualityBpm === null ? "Awaiting data" : `${numberText(data.attention.hdaQualityBpm, 2)} bpm`} note="Aggregate HDA quality signal" tone="sky" />
        <SupportCard label="Baseline RSA" value={data.autonomic.rsaBaselineMs2 === null ? "Awaiting data" : `${numberText(data.autonomic.rsaBaselineMs2, 3)} ms²`} note="Aggregate autonomic baseline" tone="green" />
        <SupportCard label="Temperature gradient" value={data.autonomic.cptdMeanC === null ? "Awaiting data" : `${numberText(data.autonomic.cptdMeanC, 2)} °C`} note="Mean central-to-peripheral difference (cPTd)" tone="neutral" />
      </div>
      <details className={styles.disclosure}>
        <summary>View autonomic and attention details</summary>
        <div className={styles.detailTables}>
          <DetailTable caption="Attention phases" headings={["Phase", "Share"]}>
            {data.attention.phases.length ? data.attention.phases.map((phase) => (
              <tr key={phase.phase}>
                <th scope="row">{phase.phase}</th>
                <td>{percentText(phase.pct)}</td>
              </tr>
            )) : <EmptyRow colSpan={2} />}
          </DetailTable>
          <DetailTable caption="Research metrics by visit window" headings={["Window", "Sustained attention", "Baseline RSA", "Temperature gradient (cPTd)"]}>
            {Array.from(new Set([
              ...data.attention.byWindow.map((row) => row.window),
              ...data.autonomic.byWindow.map((row) => row.window),
            ])).length ? Array.from(new Set([
              ...data.attention.byWindow.map((row) => row.window),
              ...data.autonomic.byWindow.map((row) => row.window),
            ])).map((window) => {
              const attention = data.attention.byWindow.find((row) => row.window === window);
              const autonomic = data.autonomic.byWindow.find((row) => row.window === window);
              return (
                <tr key={window}>
                  <th scope="row">{window}</th>
                  <td>{percentText(attention?.sustainedPct ?? null)}</td>
                  <td>{autonomic?.rsaBaselineMs2 === null || autonomic?.rsaBaselineMs2 === undefined ? "Awaiting data" : `${numberText(autonomic.rsaBaselineMs2, 3)} ms²`}</td>
                  <td>{autonomic?.cptdMeanC === null || autonomic?.cptdMeanC === undefined ? "Awaiting data" : `${numberText(autonomic.cptdMeanC, 2)} °C`}</td>
                </tr>
              );
            }) : <EmptyRow colSpan={4} />}
          </DetailTable>
          <DetailTable caption="Attention phase distribution by study group and visit window" headings={["Group", "Window", "Sustained", "Orienting", "Inattention", "Termination", "HDA quality"]}>
            {data.attention.byGroupWindow.length ? data.attention.byGroupWindow.map((row) => (
              <tr key={`${row.group}-${row.window}`}>
                <th scope="row">{row.group}</th>
                <td>{row.window}</td>
                <td>{percentText(row.sustainedPct)}</td>
                <td>{percentText(row.orientingPct)}</td>
                <td>{percentText(row.inattentionPct)}</td>
                <td>{percentText(row.terminationPct)}</td>
                <td>{row.hdaQualityBpm === null ? "Awaiting data" : `${numberText(row.hdaQualityBpm, 2)} bpm`}</td>
              </tr>
            )) : <EmptyRow colSpan={7} />}
          </DetailTable>
          <DetailTable caption="Autonomic metrics by study group and visit window" headings={["Group", "Window", "Baseline RSA", "Temperature gradient (cPTd)"]}>
            {data.autonomic.byGroupWindow.length ? data.autonomic.byGroupWindow.map((row) => (
              <tr key={`${row.group}-${row.window}`}>
                <th scope="row">{row.group}</th>
                <td>{row.window}</td>
                <td>{row.rsaBaselineMs2 === null ? "Awaiting data" : `${numberText(row.rsaBaselineMs2, 3)} ms²`}</td>
                <td>{row.cptdMeanC === null ? "Awaiting data" : `${numberText(row.cptdMeanC, 2)} °C`}</td>
              </tr>
            )) : <EmptyRow colSpan={4} />}
          </DetailTable>
        </div>
      </details>
    </section>
  );
}

function AssessmentsSection({ data }: NanoDashboardDetailsProps) {
  const instruments = Array.from(new Set(data.assessments.map((assessment) => assessment.instrument)));
  const timepoints = Array.from(new Set(data.assessments.map((assessment) => assessment.timepoint)));
  const instrumentCount = instruments.length || null;
  const applicableWindows = data.assessments.length || null;
  const complete = sumKnown(data.assessments.map((assessment) => assessment.complete));
  const expected = sumKnown(data.assessments.map((assessment) => assessment.expected));
  const coverage = ratioPercent(complete, expected);

  return (
    <section className={styles.detailSection} id="assessments" aria-labelledby="assessments-heading">
      <SectionHeading
        eyebrow="Measures"
        title="Assessments"
        headingId="assessments-heading"
        intro="Applicable instruments summarized across scheduled timepoints without exposing participant records."
        headline={percentText(coverage)}
        headlineLabel="aggregate form coverage"
      />
      <div className={styles.supportGrid}>
        <SupportCard label="Instruments" value={numberText(instrumentCount)} note="Applicable measures represented" tone="sky" />
        <SupportCard label="Applicable windows" value={numberText(applicableWindows)} note="Instrument and timepoint combinations" tone="neutral" />
        <SupportCard label="Forms complete" value={numberText(complete)} note="Summed aggregate completions" tone="green" />
        <SupportCard label="Forms expected" value={numberText(expected)} note="Summed aggregate expectations" tone="blue" />
      </div>
      <details className={styles.disclosure}>
        <summary>View assessment details</summary>
        <DetailTable
          caption="Assessment completion matrix by instrument and timepoint"
          headings={["Instrument", ...timepoints.map(humanize)]}
        >
          {instruments.length ? instruments.map((instrument) => (
            <tr key={instrument}>
              <th scope="row">{instrument}</th>
              {timepoints.map((timepoint) => {
                const assessment = data.assessments.find((row) => row.instrument === instrument && row.timepoint === timepoint);
                if (!assessment) return <td key={timepoint}>Not applicable</td>;
                const completion = assessment.pctComplete ?? ratioPercent(assessment.complete, assessment.expected);
                return (
                  <td key={timepoint}>
                    {numberText(assessment.complete)} / {numberText(assessment.expected)} · {percentText(completion)}
                  </td>
                );
              })}
            </tr>
          )) : <EmptyRow colSpan={Math.max(1, timepoints.length + 1)} />}
        </DetailTable>
      </details>
    </section>
  );
}

function ChecklistTable({
  title,
  rows,
}: {
  title: string;
  rows: NanoDashboardData["checklists"]["onboarding"];
}) {
  return (
    <DetailTable caption={title} headings={["Checklist item", "Done", "Total", "Completion"]}>
      {rows.length ? rows.map((item) => (
        <tr key={item.key}>
          <th scope="row">{humanize(item.key)}</th>
          <td>{numberText(item.done)}</td>
          <td>{numberText(item.total)}</td>
          <td>{percentText(ratioPercent(item.done, item.total))}</td>
        </tr>
      )) : <EmptyRow colSpan={4} />}
    </DetailTable>
  );
}

function OperationsSection({ data }: NanoDashboardDetailsProps) {
  const lowStock = data.inventory.length && data.inventory.every((item) => item.lowStock !== null)
    ? data.inventory.filter((item) => item.lowStock === true).length
    : null;
  const calibrationsDue = sumKnown(data.inventory.map((item) => item.calibrationDue));
  const inventoryAttention = lowStock === null || calibrationsDue === null
    ? "Awaiting data"
    : `${INTEGER_FORMATTER.format(lowStock)} / ${numberText(calibrationsDue)}`;
  const inventoryTone: Tone = lowStock === null || calibrationsDue === null
    ? "neutral"
    : lowStock > 0 || calibrationsDue > 0 ? "amber" : "green";
  const redcap = nanoRedcapIndicator(data);
  const redcapTone: Tone = redcap.state === "healthy"
    ? "green"
    : redcap.state === "warning" ? "amber" : redcap.state === "synthetic" ? "sky" : "neutral";
  const qcTone: Tone = data.checklists.openQcActions === null
    ? "neutral"
    : data.checklists.openQcActions > 0 ? "amber" : "green";
  const bestMetricLabel = data.models.bestMetric === null
    ? "Awaiting data"
    : `${data.models.metricName ?? "Metric"} ${numberText(data.models.bestMetric, 3)}`;

  return (
    <section className={styles.detailSection} id="operations" aria-labelledby="operations-heading">
      <SectionHeading
        eyebrow="Operations"
        title="Operations hub"
        headingId="operations-heading"
        intro="Inventory readiness, protocol compliance, REDCap health, and model workflow in one aggregate view."
        headline={numberText(data.checklists.openQcActions)}
        headlineLabel="open QC actions"
      />
      <div className={`${styles.supportGrid} ${styles.threeUp}`}>
        <SupportCard label="Equipment readiness" value={inventoryAttention} note="Low stock / calibration due" tone={inventoryTone} />
        <SupportCard label="Checklists and quality" value={numberText(data.checklists.openQcActions)} note={`Open QC actions · SOP acknowledgement ${percentText(data.checklists.sopAckPct)}`} tone={qcTone} />
        <SupportCard label="REDCap and data systems" value={redcap.label} note={`Last sync ${dateText(data.redcap.lastSync, true)}`} tone={redcapTone} />
      </div>
      <div className={styles.disclosureStack}>
        <details className={styles.disclosure}>
          <summary>View inventory details</summary>
          <DetailTable caption="Aggregate study inventory" headings={["Item", "Category", "In use", "Available", "Calibration due", "Status"]}>
            {data.inventory.length ? data.inventory.map((item) => (
              <tr key={item.item}>
                <th scope="row">{item.item}</th>
                <td>{item.category ? humanize(item.category) : "Awaiting data"}</td>
                <td>{numberText(item.inUse)}</td>
                <td>{numberText(item.available)}</td>
                <td>{numberText(item.calibrationDue)}</td>
                <td>
                  <StatusChip tone={item.lowStock ? "amber" : item.status === "ready" ? "green" : "sky"}>
                    {item.lowStock ? "Low stock" : item.status ? humanize(item.status) : "Awaiting data"}
                  </StatusChip>
                </td>
              </tr>
            )) : <EmptyRow colSpan={6} />}
          </DetailTable>
        </details>
        <details className={styles.disclosure}>
          <summary>View checklist and compliance details</summary>
          <div className={styles.detailTables}>
            <ChecklistTable title="Onboarding checklist" rows={data.checklists.onboarding} />
            <ChecklistTable title="Visit preparation checklist" rows={data.checklists.visitPrep} />
            <ChecklistTable title="Quality control checklist" rows={data.checklists.qc} />
          </div>
        </details>
        <details className={styles.disclosure}>
          <summary>View REDCap and model details</summary>
          <div className={styles.systemGrid}>
            <article className={styles.systemCard}>
              <span className={styles.eyebrow}>REDCap health</span>
              <h3>{redcap.label}</h3>
              <dl>
                <div><dt>API token</dt><dd>{booleanText(data.redcap.apiTokenValid, "Valid", "Needs attention")}</dd></div>
                <div><dt>Last sync</dt><dd>{dateText(data.redcap.lastSync, true)}</dd></div>
                <div><dt>Records locked</dt><dd>{numberText(data.redcap.recordsLocked)}</dd></div>
                <div><dt>Double-entry discrepancies</dt><dd>{numberText(data.redcap.doubleEntryDiscrepancies)}</dd></div>
                <div><dt>Instruments defined</dt><dd>{numberText(data.redcap.instrumentsDefined)}</dd></div>
                <div><dt>Data access groups</dt><dd>{numberText(data.redcap.dags)}</dd></div>
              </dl>
            </article>
            <article className={styles.systemCard}>
              <span className={styles.eyebrow}>Aim 3 modeling</span>
              <h3>{data.models.aim3Status ? humanize(data.models.aim3Status) : "Awaiting data"}</h3>
              <dl>
                <div><dt>Best model</dt><dd>{data.models.bestModel ?? "Awaiting data"}</dd></div>
                <div><dt>Best metric</dt><dd>{bestMetricLabel}</dd></div>
                <div><dt>SHAP readiness</dt><dd>{booleanText(data.models.shapReady)}</dd></div>
                <div><dt>Candidates reported</dt><dd>{data.models.candidates.length ? INTEGER_FORMATTER.format(data.models.candidates.length) : "Awaiting data"}</dd></div>
              </dl>
            </article>
          </div>
          <DetailTable caption="Model candidates" headings={["Candidate", "Metric", "Value"]}>
            {data.models.candidates.length ? data.models.candidates.map((candidate, index) => (
              <tr key={`${candidateString(candidate, "model") ?? "candidate"}-${index}`}>
                <th scope="row">{candidateString(candidate, "model") ?? `Candidate ${index + 1}`}</th>
                <td>{candidateString(candidate, "metric_name") ?? "Awaiting data"}</td>
                <td>{candidateString(candidate, "value") ?? "Awaiting data"}</td>
              </tr>
            )) : <EmptyRow colSpan={3} />}
          </DetailTable>
        </details>
      </div>
    </section>
  );
}

function LibrarySection({ data }: NanoDashboardDetailsProps) {
  const libraryHref = safeLibraryHref(data.library.href);
  const isExternal = libraryHref?.startsWith("http") ?? false;

  return (
    <section className={`${styles.detailSection} ${styles.librarySection}`} id="library" aria-labelledby="library-heading">
      <SectionHeading
        eyebrow="Knowledge"
        title="Library"
        headingId="library-heading"
        intro="The study’s non-PHI reading collection, indexed SOPs, and research reference material."
        headline={numberText(data.library.indexedDocuments)}
        headlineLabel="documents indexed"
      />
      <div className={styles.supportGrid}>
        <SupportCard label="Collection" value={data.library.label ?? "Awaiting data"} note="Connected reading destination" tone="blue" />
        <SupportCard label="Indexed documents" value={numberText(data.library.indexedDocuments)} note="Non-PHI documents available" tone="sky" />
        <SupportCard label="Last indexed" value={dateText(data.library.lastIndexed, true)} note="Most recent library refresh" tone="green" />
        <SupportCard label="Index source" value={data.library.indexSource ?? "Awaiting data"} note="Source scope reported by the backend" tone="neutral" />
      </div>
      <div className={styles.libraryAction}>
        <p>Use the library for protocol context and study documentation; dashboard metrics remain sourced from the aggregate data feed.</p>
        {libraryHref ? (
          <a href={libraryHref} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>
            Open reading library <ArrowUpRight size={15} strokeWidth={2.3} aria-hidden="true" />
          </a>
        ) : <span className={styles.disabledAction}>Library link awaiting data</span>}
      </div>
    </section>
  );
}

function BuddySection() {
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);

  const openBuddy = (prompt: string) => {
    setChatSeed(prompt);
    setChatOpen(true);
  };

  const prompts = [
    "Summarize current NANO cohort progress using aggregate data only.",
    "Which visit windows and QC stages need attention in the NANO dashboard?",
    "Explain the current autonomic and attention trends without using participant-level data.",
  ];

  return (
    <section className={`${styles.detailSection} ${styles.buddySection}`} id="buddy" aria-labelledby="buddy-heading">
      <SectionHeading
        eyebrow="Local assistant"
        title="ESD Lab Buddy"
        headingId="buddy-heading"
        intro="Ask the repository’s local AI assistant to interpret the live aggregate dashboard context."
        headline="Aggregate"
        headlineLabel="privacy-aware context"
      />
      <div className={styles.promptGrid}>
        {prompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => openBuddy(prompt)}>
            <span>{prompt}</span>
            <strong>Ask Buddy <ArrowRight size={15} strokeWidth={2.3} aria-hidden="true" /></strong>
          </button>
        ))}
      </div>
    </section>
  );
}

export function NanoDashboardDetails({ data }: NanoDashboardDetailsProps) {
  if (data.meta.aggregateOnly !== true) {
    return (
      <section className={`${styles.detailsSurface} ${styles.safetyState}`} role="alert" aria-labelledby="nano-safety-heading">
        <span className={styles.eyebrow}>Data safety check</span>
        <h2 id="nano-safety-heading">Aggregate dashboard unavailable</h2>
        <p>
          {data.meta.aggregateOnly === false
            ? "This feed was not marked aggregate-only, so no study metrics were rendered."
            : "The feed did not confirm its aggregate-only status, so no study metrics were rendered."}
        </p>
      </section>
    );
  }
  const isSynthetic = /synthetic/i.test(data.meta.source ?? "");

  return (
    <div className={styles.detailsSurface}>
      <div className={styles.contextBar} aria-label="Dashboard data context">
        <div>
          <span className={styles.eyebrow}>Study detail surfaces</span>
          <p>Deeper operational and research context, kept behind clear disclosures to preserve the dashboard’s calm overview.</p>
        </div>
        <div className={styles.contextChips}>
          {isSynthetic ? <StatusChip tone="amber">Synthetic data</StatusChip> : null}
          <StatusChip tone="blue">Aggregate only</StatusChip>
          <StatusChip tone="neutral">As of {dateText(data.meta.asOf)}</StatusChip>
        </div>
      </div>
      <p className={styles.privacyNote} role="note">
        Aggregate-only view. No participant identifiers, participant rows, or protected health information are shown.
      </p>

      <EnrollmentSection data={data} />
      <ScheduleSection data={data} />
      <PipelineSection data={data} />
      <ResearchSection data={data} />
      <AssessmentsSection data={data} />
      <OperationsSection data={data} />
      <LibrarySection data={data} />
      <BuddySection />
    </div>
  );
}

export default NanoDashboardDetails;
