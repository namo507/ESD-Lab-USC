import { describe, expect, it } from "vitest";

import {
  getDashboardSourceState,
  parseDashboardMetrics,
  selectNanoMetrics,
  selectRedcapSummary,
} from "@/api/dashboardMetrics";

const STUDY_ENROLLMENTS = {
  abc: 100,
  ipsa: 110,
  action: 120,
  nico: 130,
  nano: 221,
} as const;

const PROJECT_SPECS = [
  ["abc_surveys", "abc", "surveys", 1140, true, "ABC Study Surveys"],
  ["ipsa_surveys", "ipsa", "surveys", 1289, true, "IPSA Study Surveys and Data Entry"],
  ["action", "action", "combined", 1556, true, "ACTION Study"],
  ["ipsa_lab", "ipsa", "assessments", 2084, false, "IPSA Lab Assessments and Double Data Entry"],
  ["abc_lab", "abc", "assessments", 2263, false, "ABC Study (Lab Assessments and Double Data Entry)"],
  ["nico", "nico", "combined", 3836, true, "NICO Study"],
  ["nano_surveys", "nano", "surveys", 4218, true, "NANO Study Surveys"],
  ["nano_lab", "nano", "assessments", 5484, false, "NANO Lab Assessments & Double Data Entry"],
] as const;

function forms(multiplier = 1, instruments = false) {
  return {
    ...(instruments ? { instruments_total: 3 } : {}),
    incomplete: 10 * multiplier,
    unverified: 0,
    complete: 90 * multiplier,
    unknown: 0,
    total: 100 * multiplier,
    completion_rate: 0.9,
    counts_suppressed: false,
  };
}

function fixture() {
  const projectCounts = { abc: 2, ipsa: 2, action: 1, nico: 1, nano: 2 } as const;
  return {
    schema: "dashboard.metrics.v1",
    data_version: `sha256:${"a".repeat(64)}`,
    generated_at: "2026-08-07T12:00:00Z",
    aggregate_only: true,
    source: {
      kind: "live",
      transport: "api",
      system: "REDCap",
      cadence: "every_5_minutes",
      sla: { max_age_minutes: 15 },
      projects_total: 8,
      projects_ok: 8,
    },
    portfolio: {
      status: "ok",
      studies_total: 5,
      studies_reporting: 5,
      study_enrollments: Object.values(STUDY_ENROLLMENTS).reduce((sum, count) => sum + count, 0),
      study_enrollments_suppressed: false,
      event_records: 50,
      event_records_suppressed: false,
      forms: forms(8),
    },
    studies: Object.entries(STUDY_ENROLLMENTS).map(([key, enrollment]) => ({
      key,
      label: key.toUpperCase(),
      status: "ok",
      projects_total: projectCounts[key as keyof typeof projectCounts],
      projects_ok: projectCounts[key as keyof typeof projectCounts],
      target: key === "nano" ? 260 : null,
      enrollment,
      enrollment_suppressed: false,
      event_records: 10,
      event_records_suppressed: false,
      events: [{ event: "baseline_arm_1", records: 10, suppressed: false }],
      forms: forms(projectCounts[key as keyof typeof projectCounts]),
    })),
    projects: PROJECT_SPECS.map(([key, study, role, projectId, enrollmentAuthority, title]) => ({
      key,
      study,
      role,
      project_id: projectId,
      title,
      status: "ok",
      enrollment_authority: enrollmentAuthority,
      records: enrollmentAuthority ? STUDY_ENROLLMENTS[study] : 10,
      records_suppressed: false,
      event_records: 10,
      event_records_suppressed: false,
      events: [{ event: "baseline_arm_1", records: 10, suppressed: false }],
      forms: forms(1, true),
      error: null,
    })),
  };
}

describe("dashboard.metrics.v1", () => {
  it("parses the canonical aggregate-only portfolio and normalizes rates", () => {
    const metrics = parseDashboardMetrics(fixture());
    const nano = selectNanoMetrics(metrics);

    expect(metrics.source.refreshCadenceSeconds).toBe(300);
    expect(metrics.source.slaSeconds).toBe(900);
    expect(metrics.studies).toHaveLength(5);
    expect(metrics.projects).toHaveLength(8);
    expect(nano?.enrollment).toBe(221);
    expect(nano?.target).toBe(260);
    expect(nano?.forms.completionRate).toBe(90);
    expect(metrics.projects[0]).toMatchObject({ key: "abc_surveys", projectId: 1140 });
  });

  it("accepts privacy-safe suppressed participant counts through the full hierarchy", () => {
    const payload = fixture();
    const authority = payload.projects.find((project) => project.key === "abc_surveys")!;
    const study = payload.studies.find((entry) => entry.key === "abc")!;
    authority.records = null as never;
    authority.records_suppressed = true;
    authority.event_records = null as never;
    authority.event_records_suppressed = true;
    authority.events = [{ event: "baseline_arm_1", records: null, suppressed: true }] as never;
    authority.forms = {
      instruments_total: 3,
      incomplete: null,
      unverified: null,
      complete: null,
      unknown: null,
      total: null,
      completion_rate: null,
      counts_suppressed: true,
    } as never;
    study.enrollment = null as never;
    study.enrollment_suppressed = true;
    study.event_records = null as never;
    study.event_records_suppressed = true;
    study.events = [{ event: "baseline_arm_1", records: null, suppressed: true }] as never;
    study.forms = {
      incomplete: null,
      unverified: null,
      complete: null,
      unknown: null,
      total: null,
      completion_rate: null,
      counts_suppressed: true,
    } as never;
    payload.portfolio.study_enrollments = null as never;
    payload.portfolio.study_enrollments_suppressed = true;
    payload.portfolio.event_records = null as never;
    payload.portfolio.event_records_suppressed = true;
    payload.portfolio.forms = {
      incomplete: null,
      unverified: null,
      complete: null,
      unknown: null,
      total: null,
      completion_rate: null,
      counts_suppressed: true,
    } as never;

    const metrics = parseDashboardMetrics(payload);
    expect(metrics.projects[0]).toMatchObject({ records: null, recordsSuppressed: true });
    expect(metrics.studies[0]).toMatchObject({ enrollment: null, enrollmentSuppressed: true });
    expect(metrics.portfolio).toMatchObject({ studyEnrollments: null, studyEnrollmentsSuppressed: true });
  });

  it("keeps a safe partial snapshot parseable when failed counts are unavailable", () => {
    const payload = fixture();
    const authority = payload.projects.find((project) => project.key === "abc_surveys")!;
    const study = payload.studies.find((entry) => entry.key === "abc")!;
    payload.source.kind = "partial";
    payload.source.projects_ok = 7;
    payload.portfolio.status = "degraded";
    payload.portfolio.studies_reporting = 4;
    payload.portfolio.study_enrollments = null as never;
    payload.portfolio.event_records = null as never;
    study.status = "degraded";
    study.projects_ok = 1;
    study.enrollment = null as never;
    study.event_records = null as never;
    authority.status = "error";
    authority.records = null as never;
    authority.event_records = null as never;
    authority.events = [];
    authority.error = { code: "network_error" } as never;

    const metrics = parseDashboardMetrics(payload);
    expect(getDashboardSourceState(metrics, new Date("2026-08-07T12:10:00Z"))).toMatchObject({
      status: "partial",
      isLive: false,
      projectsOk: 7,
    });
  });

  it("rejects non-aggregate, unknown, duplicate, or mismatched portfolio identities", () => {
    const nonAggregate = fixture();
    nonAggregate.aggregate_only = false;
    expect(() => parseDashboardMetrics(nonAggregate)).toThrow();

    const duplicateStudy = fixture();
    (duplicateStudy.studies as unknown as Array<Record<string, unknown>>)[1]!.key = "abc";
    expect(() => parseDashboardMetrics(duplicateStudy)).toThrow(/canonical study/i);

    const wrongProject = fixture();
    (wrongProject.projects as unknown as Array<Record<string, unknown>>)[0]!.project_id = 9999;
    expect(() => parseDashboardMetrics(wrongProject)).toThrow(/canonical identity/i);

    const unexpectedSecret = fixture();
    (unexpectedSecret.projects as unknown as Array<Record<string, unknown>>)[0]!.token = "must-not-enter-browser-contract";
    expect(() => parseDashboardMetrics(unexpectedSecret)).toThrow();

    const misplacedField = fixture();
    (misplacedField.portfolio.forms as Record<string, unknown>).instruments_total = 24;
    expect(() => parseDashboardMetrics(misplacedField)).toThrow();
  });

  it("rejects missing, contradictory, and leaky suppression metadata", () => {
    const missingFlag = fixture();
    delete (missingFlag.projects as unknown as Array<Record<string, unknown>>)[0]!.records_suppressed;
    expect(() => parseDashboardMetrics(missingFlag)).toThrow();

    const contradictory = fixture();
    contradictory.projects[0]!.records_suppressed = true;
    expect(() => parseDashboardMetrics(contradictory)).toThrow(/must be null/i);

    const smallCell = fixture();
    smallCell.projects[4]!.records = 3;
    expect(() => parseDashboardMetrics(smallCell)).toThrow(/privacy-suppressed/i);

    const eventLeak = fixture();
    eventLeak.projects[0]!.events = [{ event: "baseline_arm_1", records: null, suppressed: true }] as never;
    expect(() => parseDashboardMetrics(eventLeak)).toThrow(/preserve event suppression/i);

    const hierarchyLeak = fixture();
    hierarchyLeak.projects[0]!.records = null as never;
    hierarchyLeak.projects[0]!.records_suppressed = true;
    expect(() => parseDashboardMetrics(hierarchyLeak)).toThrow(/suppression/i);
  });

  it("allows Live REDCap only for a fresh 8/8 artifact and marks an old one stale", () => {
    const metrics = parseDashboardMetrics(fixture());
    const live = getDashboardSourceState(metrics, new Date("2026-08-07T12:10:00Z"));
    const stale = getDashboardSourceState(metrics, new Date("2026-08-07T12:16:00Z"));

    expect(live).toMatchObject({ status: "live", isLive: true, projectsOk: 8, projectsTotal: 8 });
    expect(live.label).toBe("Live REDCap");
    expect(stale).toMatchObject({ status: "stale", isLive: false });
  });

  it("derives portfolio REDCap KPIs from the same validated contract", () => {
    const summary = selectRedcapSummary(parseDashboardMetrics(fixture()));

    expect(summary).toMatchObject({
      projectsOk: 8,
      projectsTotal: 8,
      instrumentsTotal: 24,
      eventRecords: 50,
      formsComplete: 720,
      formsTotal: 800,
      completionRate: 90,
      reviewCount: 80,
    });
  });
});
