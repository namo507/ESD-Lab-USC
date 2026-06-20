import type {
  FormPolicyMode,
  Participant,
  ParticipantOperations,
  QuestionnaireStatus,
  SchedulingRisk,
  StudyCode,
  VisitId,
} from "@/api/schemas";
import type { BadgeKind } from "@/components/primitives/Badge";

const VISITS: Array<{ id: string; label: string; marker: string; month: number }> = [
  { id: "nicu_dc", label: "NICU discharge", marker: "NICU", month: 0 },
  { id: "cga_3mo", label: "3 Month CGA", marker: "CGA-03", month: 3 },
  { id: "cga_6mo", label: "6 Month CGA", marker: "CGA-06", month: 6 },
  { id: "cga_9mo", label: "9 Month CGA", marker: "CGA-09", month: 9 },
  { id: "cga_12mo", label: "12 Month CGA", marker: "CGA-12", month: 12 },
  { id: "cga_18mo", label: "18 Month CGA", marker: "CGA-18", month: 18 },
  { id: "cga_24mo", label: "24 Month CGA", marker: "CGA-24", month: 24 },
  { id: "cga_36mo", label: "36 Month outcome", marker: "CGA-36", month: 36 },
];

export const PARTICIPANT_ID_LEGEND = [
  "NANO-5###: NANO-primary single-study participant",
  "NICO-9###: NICO-primary single-study participant",
  "ANONICO-9###: ANONICO-primary single-study participant",
  "DUAL-5### / DUAL-9###: dual-enrolled participant; series follows primary study",
];

export function visitRef(visit: VisitId | string) {
  return VISITS.find((item) => item.id === visit) ?? VISITS[4]!;
}

export function nextVisitRef(visit: VisitId | string) {
  const index = Math.max(0, VISITS.findIndex((item) => item.id === visit));
  return VISITS[Math.min(index + 1, VISITS.length - 1)] ?? VISITS[4]!;
}

function studiesFor(participant: Participant, index: number): StudyCode[] {
  if (index % 11 === 0) return ["NANO", "ANONICO"];
  if (index % 9 === 0) return ["NANO", "NICO"];
  if (participant.group === "ASIB") return ["ANONICO"];
  return ["NANO"];
}

function codeFor(participant: Participant, studies: StudyCode[], index: number): string {
  const digits = participant.id.replace(/\D/g, "").slice(-3) || String(index + 1).padStart(3, "0");
  const series = studies[0] === "NANO" ? "5" : "9";
  return `${studies.length > 1 ? "DUAL" : studies[0]}-${series}${digits}`;
}

function fallbackOperations(participant: Participant, index: number): ParticipantOperations {
  const studies = studiesFor(participant, index);
  const current = visitRef(participant.visit);
  const next = nextVisitRef(participant.visit);
  const policyMode: FormPolicyMode = studies.length > 1 ? "single_master" : "single_study";
  const statuses: QuestionnaireStatus[] = ["complete", "due", "missing", "did_not_qualify", "other"];
  const checklist = ["Enrollment-type check", "Visit packet assignment", "Caregiver questionnaire", "AIH/EH routing"].map((name, offset) => ({
    name,
    domain: offset < 2 ? "operations" : "forms",
    status: statuses[(index + offset) % statuses.length]!,
    due: current.marker,
  }));
  const hasMissing = checklist.some((item) => item.status === "missing");
  const risk: SchedulingRisk = studies.length > 1 && hasMissing ? "high" : studies.length > 1 || participant.qa !== "pass" ? "watch" : "low";
  const linkingId = `LINK-${participant.id.replace(/\D/g, "").slice(-3) || String(index + 1).padStart(3, "0")}-${studies.join("+")}`;

  return {
    participant_id: participant.id,
    participant_code: codeFor(participant, studies, index),
    role_label: studies.join(" + "),
    study_roles: studies,
    enrollment_type: studies.length > 1 ? "dual" : "single",
    primary_study: studies[0]!,
    group: participant.group,
    visit_type: participant.visit === "nicu_dc" ? "NICU discharge" : "CGA longitudinal",
    visit_marker: current.marker,
    current_visit: current,
    next_visit: next,
    numbering_convention: studies[0] === "NANO" ? "5-series NANO-primary participant code" : "9-series NICO/ANONICO-primary participant code",
    form_policy: {
      mode: policyMode,
      label: policyMode === "single_master" ? "Single master AIH/EH" : "Single-study form set",
      rule: policyMode === "single_master"
        ? "One master AIH and EH follows the participant across studies."
        : "Use the participant's sole study packet and no cross-study duplication.",
    },
    linking_id: linkingId,
    linked_forms: ["AIH", "EH", "Intervention history"].map((form, offset) => ({
      form,
      owner: studies.join("+"),
      policy: policyMode,
      status: statuses[(index + offset) % statuses.length]!,
      linking_id: linkingId,
    })),
    questionnaire_checklist: checklist,
    packet_requirements: [
      `${next.label} visit packet`,
      "Enrollment-type check before scheduling",
      policyMode === "single_master" ? "Single master AIH/EH" : "Single-study form set",
    ],
    scheduling_risk: risk,
    scheduling_risk_reasons: risk === "low"
      ? ["No current packet, questionnaire, or role-routing risk flagged."]
      : ["Verify enrollment type, forms, questionnaires, and visit packet before scheduling."],
    pre_visit_checks: [
      "Confirm enrollment type and study roles before offering dates.",
      "Confirm AIH/EH policy and linking ID before REDCap packet assignment.",
      "Cross-check questionnaire checklist against visit type.",
      "Review intervention history order before 36-month or outcome forms.",
    ],
    intervention_history: {
      order: "Baseline AIH -> EH update -> intervention exposure -> visit history -> 36-month review",
      summary: policyMode === "single_master"
        ? "Shared intervention history follows the participant across studies."
        : "Study-specific packet follows the participant's sole study role.",
      last_review: "pre-visit",
    },
    scheduling_note: studies.length > 1
      ? "Dual-enrolled participant: verify packet, questionnaire, and form-routing before scheduling."
      : "Single-study participant: standard visit-type routing applies.",
  };
}

export function operationsFor(participant: Participant, index = 0): ParticipantOperations {
  return participant.operations ?? fallbackOperations(participant, index);
}

export function enrollmentKind(type: ParticipantOperations["enrollment_type"]): BadgeKind {
  return type === "dual" ? "gold" : "neutral";
}

export function riskKind(risk: SchedulingRisk): BadgeKind {
  if (risk === "high") return "fail";
  if (risk === "watch") return "warn";
  return "ok";
}

export function questionnaireKind(status: QuestionnaireStatus | "watch" | undefined): BadgeKind {
  if (status === "complete") return "ok";
  if (status === "due" || status === "watch") return "pending";
  if (status === "missing") return "fail";
  if (status === "did_not_qualify") return "neutral";
  return "info";
}

export function questionnaireLabel(status: QuestionnaireStatus | "watch" | undefined): string {
  if (status === "did_not_qualify") return "Did Not Qualify";
  if (status === "other") return "Other";
  if (status === "watch") return "Due";
  return status ?? "unknown";
}

export function formPolicyLabel(policy: FormPolicyMode | undefined): string {
  if (policy === "single_master") return "Single master";
  if (policy === "dual_form") return "Dual forms";
  if (policy === "single_study") return "Single-study";
  return "Policy unset";
}
