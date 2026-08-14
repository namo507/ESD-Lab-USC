import { describe, expect, it } from "vitest";

import {
  getDashboardSourceState,
  parseDashboardMetrics,
  selectNanoMetrics,
  selectRedcapSummary,
} from "@/api/dashboardMetrics";

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    schema: "dashboard.metrics.v1",
    data_version: "sha256:test",
    generated_at: "2026-08-07T12:00:00Z",
    aggregate_only: true,
    source: {
      kind: "live",
      transport: "api",
      system: "REDCap",
      cadence: "every_30_minutes",
      sla: { max_age_minutes: 90 },
      projects_total: 8,
      projects_ok: 8,
    },
    portfolio: {
      status: "ok",
      studies_total: 5,
      studies_reporting: 5,
      study_enrollments: 655,
      event_records: 4660,
      forms: { incomplete: 10, unverified: 2, complete: 88, unknown: 0, total: 100, completion_rate: 0.88 },
    },
    studies: [
      {
        key: "nano",
        label: "NANO",
        status: "ok",
        projects_total: 2,
        projects_ok: 2,
        target: 260,
        enrollment: 221,
        event_records: 344,
        events: [
          { event: "consent_arm_1", records: 221, suppressed: false },
          { event: "caregiver_arm_1", records: null, suppressed: true },
        ],
        forms: { incomplete: 20, unverified: 1, complete: 79, unknown: 0, total: 100, completion_rate: 0.79 },
      },
      ...["abc", "ipsa", "action", "nico"].map((key) => ({
        key,
        label: key.toUpperCase(),
        status: "ok",
        projects_total: 1,
        projects_ok: 1,
        target: null,
        enrollment: 10,
        event_records: 20,
        events: [],
        forms: { incomplete: 1, unverified: 0, complete: 9, unknown: 0, total: 10, completion_rate: 0.9 },
      })),
    ],
    projects: Array.from({ length: 8 }, (_, index) => ({
      key: `project_${index + 1}`,
      study: index < 2 ? "nano" : "abc",
      role: index < 2 ? "surveys" : "assessments",
      title: `Project ${index + 1}`,
      status: "ok",
      enrollment_authority: index === 0,
      records: 10,
      event_records: 20,
      events: [],
      forms: { instruments_total: 3, incomplete: 1, unverified: 0, complete: 9, unknown: 0, total: 10, completion_rate: 0.9 },
      token: "placeholder-never-forwarded",
      error: null,
    })),
    ...overrides,
  };
}

describe("dashboard.metrics.v1", () => {
  it("parses snake-case aliases, normalizes rates, and preserves privacy suppression", () => {
    const metrics = parseDashboardMetrics(fixture());
    const nano = selectNanoMetrics(metrics);

    expect(metrics.source.refreshCadenceSeconds).toBe(1800);
    expect(metrics.source.slaSeconds).toBe(5400);
    expect(metrics.studies).toHaveLength(5);
    expect(nano?.enrollment).toBe(221);
    expect(nano?.target).toBe(260);
    expect(nano?.forms.completionRate).toBe(79);
    expect(nano?.events[1]).toMatchObject({ records: null, suppressed: true });
    expect(metrics.projects[0]).not.toHaveProperty("token");
  });

  it("allows Live REDCap only for a fresh aggregate-only 8/8 artifact", () => {
    const metrics = parseDashboardMetrics(fixture());
    const state = getDashboardSourceState(metrics, new Date("2026-08-07T12:10:00Z"));

    expect(state).toMatchObject({ status: "live", isLive: true, projectsOk: 8, projectsTotal: 8 });
    expect(state.label).toBe("Live REDCap");
  });

  it("marks fresh 7/8 data partial and over-SLA data stale", () => {
    const partialPayload = fixture({
      source: {
        kind: "partial",
        transport: "api",
        system: "REDCap",
        refresh_cadence_seconds: 1800,
        sla_seconds: 5400,
        projects_total: 8,
        projects_ok: 7,
      },
    });
    const partial = getDashboardSourceState(
      parseDashboardMetrics(partialPayload),
      new Date("2026-08-07T12:10:00Z"),
    );
    const stale = getDashboardSourceState(
      parseDashboardMetrics(fixture()),
      new Date("2026-08-07T13:31:00Z"),
    );

    expect(partial).toMatchObject({ status: "partial", isLive: false });
    expect(stale).toMatchObject({ status: "stale", isLive: false });
  });

  it("degrades demo or non-aggregate input to unavailable without a Live label", () => {
    const metrics = parseDashboardMetrics(fixture({
      aggregate_only: false,
      source: {
        kind: "demo",
        system: "REDCap",
        cadence: "every_30_minutes",
        sla: { max_age_minutes: 90 },
        projects_total: 8,
        projects_ok: 8,
      },
    }));
    const state = getDashboardSourceState(metrics, new Date("2026-08-07T12:01:00Z"));

    expect(state).toMatchObject({ status: "unavailable", isLive: false });
    expect(state.label).not.toMatch(/live/i);
  });

  it("derives portfolio REDCap KPIs from the same contract", () => {
    const summary = selectRedcapSummary(parseDashboardMetrics(fixture()));

    expect(summary).toMatchObject({
      projectsOk: 8,
      projectsTotal: 8,
      instrumentsTotal: 24,
      eventRecords: 4660,
      formsComplete: 88,
      formsTotal: 100,
      completionRate: 88,
      reviewCount: 12,
    });
  });
});
