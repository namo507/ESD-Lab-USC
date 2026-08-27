// AUTO-GENERATED from config/redcap_config.yml by scripts/gen_redcap_constants.mjs.
// DO NOT EDIT BY HAND. Run `node scripts/gen_redcap_constants.mjs` to refresh.

export const REDCAP_PROXY_URL = "/api/redcap";
export const REDCAP_DASHBOARD_DATA_URL = "/dashboard/data/dashboard_data.json";
export const PID = 5955 as const;
export const PROJECT_TITLE = "Namit - NANO Study Surveys" as const;
export const EVENT_ORDER = [
  "consent_arm_1",
  "caregiver_1_arm_1",
  "caregiver_2_arm_1",
  "sibling_arm_1",
  "1_month_arm_1",
  "2_months_arm_1",
  "3_months_arm_1",
  "6_months_arm_1",
  "9_months_arm_1",
  "12_months_arm_1",
  "24_months_arm_1",
  "36_months_arm_1"
] as const;
export const EVENT_LABELS = {
  "consent_arm_1": "Consent",
  "caregiver_1_arm_1": "Caregiver 1",
  "caregiver_2_arm_1": "Caregiver 2",
  "sibling_arm_1": "Sibling",
  "1_month_arm_1": "1 Month",
  "2_months_arm_1": "2 Months",
  "3_months_arm_1": "3 Months",
  "6_months_arm_1": "6 Months",
  "9_months_arm_1": "9 Months",
  "12_months_arm_1": "12 Months",
  "24_months_arm_1": "24 Months",
  "36_months_arm_1": "36 Months"
} as const;
export const VISIT_EVENTS = [
  "1_month_arm_1",
  "2_months_arm_1",
  "3_months_arm_1",
  "6_months_arm_1",
  "9_months_arm_1",
  "12_months_arm_1",
  "24_months_arm_1",
  "36_months_arm_1"
] as const;
export const CARRY_FORWARD = {
  "instrument": "csbs_caregiver",
  "complete_field": "csbs_caregiver_complete",
  "events": [
    "6_months_arm_1",
    "9_months_arm_1",
    "12_months_arm_1",
    "24_months_arm_1"
  ]
} as const;
export const VISIT_DATE_FIELD = "visit_date" as const;
export const STATUS_CODES = {
  "0": {
    "label": "Incomplete",
    "token": "status-red",
    "normalized": "incomplete"
  },
  "1": {
    "label": "Unverified",
    "token": "status-amber",
    "normalized": "unverified"
  },
  "2": {
    "label": "Complete",
    "token": "status-green",
    "normalized": "complete"
  },
  "": {
    "label": "Not started",
    "token": "status-grey",
    "normalized": "not_started"
  },
  "SKIP": {
    "label": "Skipped",
    "token": "status-blue",
    "normalized": "skipped"
  }
} as const;
export const NORMALIZED_STATUSES = [
  "incomplete",
  "unverified",
  "complete",
  "not_started",
  "skipped"
] as const;
export const ANOMALY_CODES = {
  "R1": "6m CSBS incomplete and 9m visit_date set",
  "R2": "9m CSBS incomplete and 12m visit_date set",
  "R3": "6m CSBS blank but 9m CSBS complete",
  "R4": "9m CSBS blank but 12m CSBS complete",
  "R5": "12m CSBS incomplete and 24m visit_date set"
} as const;
export const PHI_FIELDS = [
  "first_name",
  "last_name",
  "child_dob",
  "caregiver_name",
  "caregiver_phone",
  "street_address",
  "email",
  "mrn",
  "record_id_original"
] as const;

export type RedcapEventName = typeof EVENT_ORDER[number];
export type VisitEventName = typeof VISIT_EVENTS[number];
export type RedcapStatusCode = keyof typeof STATUS_CODES;
export type CsbsStatus = typeof NORMALIZED_STATUSES[number];
export type AnomalyCode = keyof typeof ANOMALY_CODES;
