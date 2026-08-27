/**
 * The five studies, in both vocabularies.
 *
 * REDCap and the public site do not use the same names for the same study, and
 * neither vocabulary is wrong — REDCap keys are what the data is filed under,
 * and the public names are what families were recruited with. Both are carried
 * here and mapped, because collapsing them loses the ability to answer either
 * kind of question.
 *
 * Every descriptive field is quoted from a source that is named in `sources`.
 * Nothing here is inferred. Where a study has no published expansion of its
 * acronym, `longName` is null and the surface shows the REDCap project titles
 * instead of guessing — the buddy does not get to invent a name any more than
 * it gets to invent a number.
 */

export type StudyKey = "nano" | "nico" | "ipsa" | "action" | "abc";

export interface StudyProfile {
  key: StudyKey;
  /** REDCap vocabulary: the key data is filed under. */
  label: string;
  /** Family-facing name from esdlabsc.com/our-studies. */
  publicName: string;
  /** Published expansion, or null when no source publishes one. */
  longName: string | null;
  /**
   * Set when the repository and the public site disagree on the expansion. The
   * surface shows both rather than silently preferring one.
   */
  longNameAlt: string | null;
  /** Current recruitment or closed, per the public site's own grouping. */
  status: "recruiting" | "closed";
  /** One sentence, condensed from the public description. */
  summary: string;
  /** Age band the study follows. */
  ages: string;
  /** Where visits happened. */
  setting: string;
  sources: string[];
  /** Secondary-palette accent. One per study so the ring reads as five things. */
  accent: string;
  /** Where "open the data" goes for this study. */
  route: string;
}

export const PUBLIC_SITE_SOURCE = "esdlabsc.com/our-studies";
export const PORTFOLIO_SOURCE = "dashboard/data/redcap_portfolio.json";
export const ENTITIES_SOURCE = "dashboard/context_skill/references/entities.md";

export const STUDY_PROFILES: readonly StudyProfile[] = [
  {
    key: "nano",
    label: "NANO",
    publicName: "NANO Study",
    longName: "Neonatal Autonomic Nervous System Organization",
    // The lab's own context pack expands NANO differently. Neither is
    // overridden here; see docs/study_vocabulary.md.
    longNameAlt: "Neurodevelopment of Autonomic and Neural Organization",
    status: "recruiting",
    summary:
      "Follows newborns through the first three years, tracking early social, motor, and language development.",
    ages: "birth to 36 months",
    setting: "NICU, lab, and in-home",
    sources: [PUBLIC_SITE_SOURCE, ENTITIES_SOURCE],
    accent: "#3366ff",
    route: "/nano/lgcm-trajectories",
  },
  {
    key: "nico",
    label: "NICO",
    publicName: "NICU Exit Study",
    longName: null,
    longNameAlt: null,
    status: "closed",
    summary:
      "Followed preterm infants from under one month to twelve months, monitoring heart rate, body temperature, and maternal and infant risk factors.",
    ages: "under 1 month to 12 months",
    setting: "PRISMA-Richland NICU, lab, and in-home",
    sources: [PUBLIC_SITE_SOURCE],
    accent: "#f57f00",
    route: "/nico/aim3-clusters",
  },
  {
    key: "ipsa",
    label: "IPSA",
    publicName: "IPSA Study",
    longName: "Infant Predictors of Social Attention",
    longNameAlt: null,
    status: "closed",
    summary:
      "Followed newborns through the first three years with clinical assessments, attention experiments, and paired parent-infant heart rate.",
    ages: "birth to 36 months",
    setting: "lab and in-home",
    sources: [PUBLIC_SITE_SOURCE],
    accent: "#f4da26",
    route: "/redcap-portfolio",
  },
  {
    key: "action",
    label: "ACTION",
    publicName: "ACTION Study",
    longName: null,
    longNameAlt: null,
    status: "closed",
    summary:
      "Followed infants at 4, 8, and 18 months with head-mounted eye tracking worn by both parent and baby during play.",
    ages: "4, 8, and 18 months",
    setting: "in-home only",
    sources: [PUBLIC_SITE_SOURCE],
    accent: "#f8b2b1",
    route: "/participants",
  },
  {
    key: "abc",
    label: "ABC",
    publicName: "ABC Study",
    longName: null,
    longNameAlt: null,
    status: "closed",
    summary:
      "Extended IPSA to infants at elevated likelihood for ADHD, assessed at 12, 24, and 36 months.",
    ages: "12, 24, and 36 months",
    setting: "lab only",
    sources: [PUBLIC_SITE_SOURCE],
    accent: "#d74e2d",
    route: "/redcap-portfolio",
  },
] as const;

export function studyProfile(key: StudyKey): StudyProfile {
  const found = STUDY_PROFILES.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown study: ${key}`);
  return found;
}

/** Ordering on the front door: recruiting first, then by portfolio size. */
export const GLYPH_ORDER: readonly StudyKey[] = ["nano", "nico", "ipsa", "action", "abc"] as const;
