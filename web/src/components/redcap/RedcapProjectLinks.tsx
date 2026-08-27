import { redcapLinksForStudy, redcapOrigin } from "@/api/redcapLinks";
import type { DashboardMetrics } from "@/api/dashboardMetrics";
import styles from "./RedcapProjectLinks.module.css";

/**
 * "Open in REDCap" links for the projects behind the active study scope.
 *
 * Renders nothing at all when the deployment has no configured REDCap origin,
 * which is the default for the public Pages build. Showing a disabled or
 * placeholder link there would imply a capability the page does not have.
 */
export interface RedcapProjectLinksProps {
  metrics: DashboardMetrics | null | undefined;
  /** Active scope: a study key, or `ALL` for the whole portfolio. */
  studyKey: string;
  /** Overridable for tests; defaults to the build-time origin. */
  origin?: string | null;
}

export function RedcapProjectLinks({
  metrics,
  studyKey,
  origin = redcapOrigin(),
}: RedcapProjectLinksProps) {
  const links = redcapLinksForStudy(metrics, studyKey, origin);
  if (!links.length) return null;

  const scopeLabel = studyKey.toUpperCase() === "ALL" ? "the portfolio" : studyKey.toUpperCase();

  return (
    <section
      className={styles.wrap}
      aria-label={`REDCap projects for ${scopeLabel}`}
      data-insight="redcap-project-links"
      data-insight-term="Open in REDCap"
      data-insight-body="Links open the REDCap project home page for this study in a new tab. Only the project id travels in the URL; no participant identifiers or API tokens are ever included."
    >
      <div className={styles.eyebrow}>Open in REDCap</div>
      <ul className={styles.list}>
        {links.map((link) => (
          <li key={link.key}>
            <a
              className={styles.link}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              data-unhealthy={link.healthy ? undefined : true}
            >
              <span className={styles.title}>{link.title}</span>
              <span className={styles.meta}>
                pid {link.projectId}
                {link.role ? ` · ${link.role}` : ""}
                {link.enrollmentAuthority ? " · enrollment authority" : ""}
                {link.healthy ? "" : " · last sync failed"}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
