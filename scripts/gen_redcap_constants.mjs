#!/usr/bin/env node
// AUTO-GENERATOR: reads config/redcap_config.yml and writes TS constants.
// Keep this dependency-light: PyYAML is already part of the Python pipeline.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const configPath = resolve(root, "config/redcap_config.yml");
const outputPath = resolve(root, "web/src/constants/redcapConfig.ts");

const pythonCandidates = [
  process.env.PYTHON,
  resolve(root, ".venv/bin/python"),
  resolve(root, ".venv-codex/bin/python"),
  "python3",
  "python",
].filter(Boolean);
const pythonProgram = [
  "import json, pathlib, yaml",
  `path = pathlib.Path(${JSON.stringify(configPath)})`,
  "print(json.dumps(yaml.safe_load(path.read_text(encoding='utf-8'))))",
].join("; ");

let py;
for (const candidate of pythonCandidates) {
  const result = spawnSync(candidate, ["-c", pythonProgram], { encoding: "utf-8" });
  py = result;
  if (result.status === 0) break;
}

if (!py || py.status !== 0) {
  process.stderr.write(
    py?.stderr || py?.error?.message || "Unable to parse config/redcap_config.yml\n",
  );
  process.exit(py?.status || 1);
}

const c = JSON.parse(py.stdout);
const banner = [
  "// AUTO-GENERATED from config/redcap_config.yml by scripts/gen_redcap_constants.mjs.",
  "// DO NOT EDIT BY HAND. Run `node scripts/gen_redcap_constants.mjs` to refresh.",
  "",
].join("\n");

const statusEntries = Object.entries(c.status_codes || {});
const normalizedStatuses = statusEntries.map(([, value]) => value.normalized);

const ts = `${banner}
export const REDCAP_PROXY_URL = "/api/redcap";
export const REDCAP_DASHBOARD_DATA_URL = "/dashboard/data/dashboard_data.json";
export const PID = ${JSON.stringify(c.project.pid)} as const;
export const PROJECT_TITLE = ${JSON.stringify(c.project.title)} as const;
export const EVENT_ORDER = ${JSON.stringify(c.events.order, null, 2)} as const;
export const EVENT_LABELS = ${JSON.stringify(c.events.labels, null, 2)} as const;
export const VISIT_EVENTS = ${JSON.stringify(c.events.visit_events, null, 2)} as const;
export const CARRY_FORWARD = ${JSON.stringify(c.instruments.carry_forward, null, 2)} as const;
export const VISIT_DATE_FIELD = ${JSON.stringify(c.instruments.visit_date_field)} as const;
export const STATUS_CODES = ${JSON.stringify(c.status_codes, null, 2)} as const;
export const NORMALIZED_STATUSES = ${JSON.stringify(normalizedStatuses, null, 2)} as const;
export const ANOMALY_CODES = ${JSON.stringify(c.anomaly_codes, null, 2)} as const;
export const PHI_FIELDS = ${JSON.stringify(c.phi_fields, null, 2)} as const;

export type RedcapEventName = typeof EVENT_ORDER[number];
export type VisitEventName = typeof VISIT_EVENTS[number];
export type RedcapStatusCode = keyof typeof STATUS_CODES;
export type CsbsStatus = typeof NORMALIZED_STATUSES[number];
export type AnomalyCode = keyof typeof ANOMALY_CODES;
`;

mkdirSync(resolve(outputPath, ".."), { recursive: true });
writeFileSync(outputPath, ts, "utf-8");
console.log(`Wrote ${outputPath}`);
