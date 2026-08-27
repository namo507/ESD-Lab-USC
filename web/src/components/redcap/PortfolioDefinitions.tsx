import { Card, SectionLabel } from "@/components/primitives";
import type { RedcapPortfolio } from "@/api/redcapPortfolio";
import styles from "@/routes/RedcapPortfolio.module.css";

/**
 * What every number on this page means, and what the page will not show.
 *
 * Kept beside the data rather than in separate documentation: the completion
 * vocabulary in particular is easy to misread, and a rate quoted without its
 * denominator has caused real confusion in study meetings.
 */
export function PortfolioDefinitions({ portfolio }: { portfolio: RedcapPortfolio }) {
  const cadenceMinutes = Math.round(portfolio.refresh_cadence_seconds / 60);

  return (
    <div className={styles.prose}>
      <Card pad={22}>
        <SectionLabel>What this is</SectionLabel>
        <p>
          A structural view of the {portfolio.projects_total} REDCap projects behind the lab&apos;s
          five studies. It answers questions about how the projects are <em>built</em> — which
          instruments exist, how they are wired to events, how consistently the same form is
          defined across studies, and how far along each form is — without opening eight
          projects side by side.
        </p>
        <p>
          It is rebuilt every {cadenceMinutes} minutes by{" "}
          <code>scripts/build_redcap_portfolio_data.py</code> and published as a single static
          artifact. The page reads that file; it never talks to REDCap directly.
        </p>
      </Card>

      <Card pad={22}>
        <SectionLabel>Read-only by construction</SectionLabel>
        <p>
          The client that builds this artifact accepts only REDCap <em>export</em> calls:
          project info, metadata, instruments, events, form-event mapping, and records. Any
          other content type is refused before a request is built, as is any request carrying a
          parameter REDCap uses to write (<code>action</code>, <code>data</code>,{" "}
          <code>returnContent</code>, <code>overwriteBehavior</code>,{" "}
          <code>forceAutoNumber</code>). An import or delete cannot be issued through it even by
          a caller that asks for one.
        </p>
      </Card>

      <Card pad={22}>
        <SectionLabel>No participant data</SectionLabel>
        <p>
          One record export runs per project. It requests only the record ID field and the{" "}
          <code>&lt;form&gt;_complete</code> status fields, whose values are <code>0</code>,{" "}
          <code>1</code>, <code>2</code>, or empty. Those rows are reduced to counts and dropped
          in the same function; no identifier or response value is stored, returned, or
          displayed.
        </p>
        <p>
          Any count that would describe fewer than {portfolio.small_cell_threshold} participants
          is withheld and shown as <strong>—</strong>. When one bucket in a completion breakdown
          is withheld, the rest of that breakdown goes with it, so the hidden number cannot be
          recovered by subtraction.
        </p>
      </Card>

      <Card pad={22}>
        <SectionLabel>No item text, no identifier fields</SectionLabel>
        <p>
          Field labels are the verbatim wording of licensed assessments (Bayley-4, M-CHAT,
          ADOS-2, EPDS, CSBS). Republishing them would be a copyright problem independent of any
          privacy question, so they are never exported — only field names, types, validation
          rules, and a count of answer options. Instrument labels <em>are</em> shown: those are
          the lab&apos;s own form titles.
        </p>
        <p>
          Fields REDCap flags as direct identifiers are dropped entirely. Their names are not
          themselves PHI, but listing them would map exactly where identifiers live in each
          project. Each project reports how many were withheld so field totals still reconcile
          against REDCap.
        </p>
      </Card>

      <Card pad={22}>
        <SectionLabel>How the numbers are defined</SectionLabel>
        <dl className={styles.defs}>
          <dt>Participants</dt>
          <dd>
            Distinct record IDs in a project. A study&apos;s figure comes from its enrollment
            authority project only — the lab assessment project holds the same people, so
            summing the two would count them twice.
          </dd>

          <dt>Record-events</dt>
          <dd>
            Rows in a flat export: one per participant per event. A longitudinal project has
            many more record-events than participants.
          </dd>

          <dt>Complete / Unverified / Incomplete</dt>
          <dd>
            REDCap&apos;s three <code>&lt;form&gt;_complete</code> states (2, 1, and 0). These count
            form instances, not people: 260 participants across 48 instruments produce up to
            12,480 status cells.
          </dd>

          <dt>Not started</dt>
          <dd>An empty status cell — the form was never opened for that participant and event.</dd>

          <dt>Started</dt>
          <dd>Complete plus Unverified plus Incomplete. Excludes Not started.</dd>

          <dt>Completion rate</dt>
          <dd>
            Complete ÷ Started, as a percentage. Deliberately excludes Not started, so a form
            that has not reached a cohort yet does not read as failing.
          </dd>

          <dt>Verdicts (Comparison tab)</dt>
          <dd>
            <strong>Identical</strong> — every compared project defines the field with the same
            name and REDCap type. <strong>Type differs</strong> — same name, different type.{" "}
            <strong>Partial</strong> — at least one project does not define the field. Because
            item wording is not published, <em>identical</em> confirms matching definitions, not
            matching questions.
          </dd>

          <dt>Structural signals</dt>
          <dd>
            Counts of design features, not defects. They describe how an instrument was built
            and what that implies for the data it produces.
          </dd>
        </dl>
      </Card>

      <Card pad={22}>
        <SectionLabel>Rebuilding this page</SectionLabel>
        <p>
          <code>make redcap-portfolio</code> regenerates the artifact locally from the tokens in
          your <code>.env</code>. In CI the REDCap sync workflow runs the same build every{" "}
          {cadenceMinutes} minutes, and the Pages publisher re-validates the payload&apos;s safety
          declarations before deploying it. A payload that claims to carry item text or record
          data is refused rather than published.
        </p>
        <p className={styles.stampLine}>
          Artifact {portfolio.data_version.slice(0, 19)} · generated {portfolio.generated_at}
        </p>
      </Card>
    </div>
  );
}
