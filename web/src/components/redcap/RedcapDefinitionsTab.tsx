import { Badge, Card } from "@/components/primitives";
import type { RedcapPortfolio } from "@/api/redcapPortfolio";
import { PanelHead, formatCount } from "./portfolioPrimitives";
import styles from "./RedcapPortfolio.module.css";

export function RedcapDefinitionsTab({ portfolio }: { portfolio: RedcapPortfolio | undefined }) {
  const threshold = portfolio?.smallCellThreshold ?? 5;

  return (
    <div className={styles.stack}>
      <Card pad={0}>
        <PanelHead
          title="What these panels are"
          aside={<Badge kind="ok" size="sm">Read-only</Badge>}
        />
        <div className={styles.prose}>
          <p>
            The portfolio panels describe how the lab's REDCap projects are built and how far
            data entry has progressed. Everything is derived from export-only API calls that run
            on the same five-minute schedule as the aggregate status snapshot, then published as
            two static artifacts the browser reads directly.
          </p>
          <dl className={styles.defs}>
            <div>
              <dt>Read-only guarantee</dt>
              <dd>
                The sync requests only the <code className="t-mono">project</code>,{" "}
                <code className="t-mono">metadata</code>, <code className="t-mono">instrument</code>,{" "}
                <code className="t-mono">event</code>, <code className="t-mono">formEventMapping</code>,
                and <code className="t-mono">record</code> exports. Write parameters are never sent,
                and a redirect response is rejected rather than followed.
              </dd>
            </div>
            <div>
              <dt>No participant data</dt>
              <dd>
                The only call that touches records asks for the record-identifier field plus the{" "}
                <code className="t-mono">&lt;form&gt;_complete</code> status fields. Those rows are
                reduced to counts inside the fetch function and discarded; no identifier or
                response value is stored, published, or displayed.
              </dd>
            </div>
            <div>
              <dt>Small-cell suppression</dt>
              <dd>
                A published count is either zero or at least {threshold}. Anything smaller is
                withheld and shown as <em>Suppressed</em>. When a single row in a group is hidden,
                a second one is hidden with it, so no hidden value can be recovered by subtracting
                the visible rows from a total.
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card pad={0}>
        <PanelHead title="How the numbers are defined" />
        <div className={styles.prose}>
          <dl className={styles.defs}>
            <div>
              <dt>Records</dt>
              <dd>Distinct record identifiers in a project — the same figure the aggregate enrollment contract publishes.</dd>
            </div>
            <div>
              <dt>Record-events</dt>
              <dd>
                Rows in the completion export that carry at least one saved instrument status. A
                record contributes one row per event it has data for.
              </dd>
            </div>
            <div>
              <dt>Complete · Incomplete · Unverified</dt>
              <dd>
                REDCap's <code className="t-mono">&lt;form&gt;_complete</code> states (2, 0, and 1).
                A cell is counted only when its instrument is designated for that event, so an
                instrument that an event never collects is not counted against it.
              </dd>
            </div>
            <div>
              <dt>Not started</dt>
              <dd>A designated instrument whose completion cell is still empty.</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>Complete + Incomplete + Unverified.</dd>
            </div>
            <div>
              <dt>Completion rate</dt>
              <dd>Complete ÷ Started. Not-started cells are excluded so the rate reflects work in progress.</dd>
            </div>
            <div>
              <dt>Identifier-flagged</dt>
              <dd>
                Fields REDCap marks as identifiers. Only the flag and the field name are published —
                never a value.
              </dd>
            </div>
            <div>
              <dt>Harmonization verdicts</dt>
              <dd>
                <strong>Identical</strong>: present in every compared project with the same field
                type and label. <strong>Label differs</strong> and <strong>type differs</strong>:
                present everywhere but not matching. <strong>Partial</strong>: missing from at
                least one project.
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card pad={0}>
        <PanelHead title="Rebuilding the snapshot" />
        <div className={styles.prose}>
          <p>The scheduled workflow runs both syncs; locally they are two commands:</p>
          <pre className={styles.code}>
            <code>{`python scripts/sync_redcap_portfolio.py --require-all
python scripts/build_redcap_portfolio_data.py --require-all`}</code>
          </pre>
          <p>
            The first writes <code className="t-mono">dashboard/data/dashboard_metrics.json</code>{" "}
            (project health and aggregate enrollment). The second writes{" "}
            <code className="t-mono">redcap_portfolio.json</code> and{" "}
            <code className="t-mono">redcap_portfolio_fields.json</code>, which power these panels.
            All three are git-ignored and re-validated by the Pages packager before publication.
          </p>
          {portfolio && (
            <p className={styles.note}>
              This snapshot: {formatCount(portfolio.totals.instruments)} instruments and{" "}
              {formatCount(portfolio.totals.fields)} fields across{" "}
              {formatCount(portfolio.totals.projectsOk)} of {formatCount(portfolio.totals.projects)}{" "}
              projects · version <span className="t-mono">{portfolio.dataVersion.slice(0, 19)}…</span>
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
