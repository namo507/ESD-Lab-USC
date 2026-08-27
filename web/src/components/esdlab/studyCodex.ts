/**
 * Turns the portfolio artifact into the facts a codex card shows.
 *
 * The hard rule this file exists to enforce: **every number carries the artifact
 * it came from and how old that artifact is.** A fact with no `source` cannot be
 * constructed — the type will not allow it — so there is no path by which an
 * uncited number reaches the screen.
 *
 * When the artifact is missing (it is generated, gitignored, and absent on a
 * fresh clone) the card degrades to the descriptive facts, which are quoted from
 * the public site, and says plainly that the counts are not published rather
 * than showing a zero.
 */
import {
  portfolioFreshness,
  type RedcapPortfolio,
  type RedcapPortfolioStudy,
} from "@/api/redcapPortfolio";
import {
  PORTFOLIO_SOURCE,
  PUBLIC_SITE_SOURCE,
  studyProfile,
  type StudyKey,
} from "@/data/studyProfiles";

export interface CodexFact {
  label: string;
  value: string;
  /** Artifact or URL this value came from. Never optional. */
  source: string;
}

export interface StudyCodex {
  key: StudyKey;
  title: string;
  /** Published expansion, or the honest absence of one. */
  subtitle: string;
  /** Set only where the repo and the public site disagree. */
  conflict: string | null;
  facts: CodexFact[];
  /** "3 min ago" / "not published". */
  freshness: string;
  freshnessStatus: "live" | "stale" | "unavailable";
  /** Seed for the buddy when the reader asks about this study. */
  question: string;
}

function formatCount(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toLocaleString("en-US");
}

/** Roll the per-project rows up to the study the glyph represents. */
function studyRow(portfolio: RedcapPortfolio | null, key: StudyKey): RedcapPortfolioStudy | null {
  return portfolio?.studies.find((s) => s.key === key) ?? null;
}

export function buildStudyCodex(
  key: StudyKey,
  portfolio: RedcapPortfolio | null | undefined,
  now: number = Date.now(),
): StudyCodex {
  const profile = studyProfile(key);
  const row = studyRow(portfolio ?? null, key);
  const fresh = portfolioFreshness(portfolio, now);

  const facts: CodexFact[] = [];

  // Descriptive facts are always available: they are quoted, not computed.
  facts.push({ label: "Ages", value: profile.ages, source: PUBLIC_SITE_SOURCE });
  facts.push({ label: "Setting", value: profile.setting, source: PUBLIC_SITE_SOURCE });
  facts.push({
    label: "Status",
    value: profile.status === "recruiting" ? "recruiting now" : "closed to enrolment",
    source: PUBLIC_SITE_SOURCE,
  });

  if (row) {
    const projects = row.project_keys.length;
    facts.push({
      label: "REDCap projects",
      value: `${projects} ${projects === 1 ? "project" : "projects"}`,
      source: PORTFOLIO_SOURCE,
    });
    const records = formatCount(row.records);
    if (records) facts.push({ label: "Records", value: records, source: PORTFOLIO_SOURCE });
    facts.push({
      label: "Instruments",
      value: formatCount(row.instruments) ?? "—",
      source: PORTFOLIO_SOURCE,
    });
    facts.push({ label: "Fields", value: formatCount(row.fields) ?? "—", source: PORTFOLIO_SOURCE });
    facts.push({ label: "Events", value: formatCount(row.events) ?? "—", source: PORTFOLIO_SOURCE });
  } else {
    // No artifact. Say so; do not render a zero as though it were a count.
    facts.push({
      label: "REDCap counts",
      value: "not published yet",
      source: PORTFOLIO_SOURCE,
    });
  }

  const subtitle = profile.longName ?? `${profile.publicName} · no published expansion`;

  return {
    key,
    title: profile.label,
    subtitle,
    conflict: profile.longNameAlt ? `Lab context pack records: ${profile.longNameAlt}` : null,
    facts: facts.slice(0, 8),
    freshness: fresh.label,
    freshnessStatus: fresh.status,
    question: `What is the ${profile.label} study and what is in its REDCap projects?`,
  };
}

/**
 * The one ambient line on the resting surface.
 *
 * Deliberately a single word plus a dot. The timestamp exists but stays hidden
 * until hover, because a resting surface that shows a clock is a surface that
 * asks to be read.
 */
export function ambientStatus(
  portfolio: RedcapPortfolio | null | undefined,
  now: number = Date.now(),
): { word: "live" | "stale" | "offline"; detail: string } {
  const fresh = portfolioFreshness(portfolio, now);
  if (fresh.status === "unavailable") {
    return { word: "offline", detail: `${PORTFOLIO_SOURCE} has not been published` };
  }
  if (fresh.status === "stale") {
    return { word: "stale", detail: `${PORTFOLIO_SOURCE} · ${fresh.label}` };
  }
  return { word: "live", detail: `${PORTFOLIO_SOURCE} · ${fresh.label}` };
}
