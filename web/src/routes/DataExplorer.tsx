import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { Button, Card, DataTable, SectionLabel, Segmented } from "@/components/primitives";
import { useParticipants, useRedcapEvents, useRuns, useStages } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { exportCsvFile } from "@/lib/exportCsv";
import { logAudit } from "@/lib/audit";
import styles from "./DataExplorer.module.css";

type TableName = "participants" | "runs" | "stages" | "redcap_events";
type RowRecord = Record<string, unknown>;

const TABLE_OPTIONS: Array<{ value: TableName; label: string }> = [
  { value: "participants", label: "participants" },
  { value: "runs", label: "runs" },
  { value: "stages", label: "stages" },
  { value: "redcap_events", label: "redcap events" },
];

const COLUMN_KEYS: Record<TableName, string[]> = {
  participants: ["id", "group", "cga_wks", "sex", "visit", "windows", "qa", "rmssd", "hf", "hda", "updated", "enrolled", "site"],
  runs: ["id", "triggered", "actor", "scope", "status", "duration", "stage", "windows"],
  stages: ["id", "label", "inflight", "queued", "done", "fail", "rate", "eta"],
  redcap_events: ["ts", "form", "n", "status", "note"],
};

function asRows<T extends object>(rows: T[]): RowRecord[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row)) as RowRecord);
}

function makeColumns(
  tableName: TableName,
  navigate: (to: string) => void,
  includeVersion: boolean,
): Array<ColumnDef<RowRecord>> {
  const keys = includeVersion ? [...COLUMN_KEYS[tableName], "version_tag"] : COLUMN_KEYS[tableName];
  return keys.map((key) => {
    if (tableName === "participants" && key === "id") {
      return {
        accessorKey: key,
        header: key,
        cell: (info) => {
          const id = String(info.getValue() ?? "");
          return (
            <button
              type="button"
              className="t-mono"
              style={{ border: 0, background: "transparent", color: "var(--usc-garnet)", cursor: "pointer", fontWeight: 700, padding: 0 }}
              onClick={() => navigate(`/participants/${id}`)}
            >
              {id}
            </button>
          );
        },
      };
    }
    return { accessorKey: key, header: key.replace(/_/g, " ") };
  });
}

function ColumnPanel<TData extends object>({
  columns,
}: {
  columns: Array<Column<TData, unknown>>;
}) {
  return (
    <details className={styles.columns}>
      <summary>
        <Button variant="secondary" size="sm" icon="columns-3">Columns</Button>
      </summary>
      <div className={styles.columnCard}>
        <SectionLabel>Columns</SectionLabel>
        <div className={styles.columnGrid}>
          {columns.map((column) => (
            <label key={column.id} className={styles.columnLabel}>
              <input
                type="checkbox"
                checked={column.getIsVisible()}
                onChange={(event) => column.toggleVisibility(event.target.checked)}
              />
              <span>{column.id.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function exportRows(tableName: TableName, rows: RowRecord[], columns: Array<Column<RowRecord, unknown>>): void {
  const visible = columns.filter((column) => column.getIsVisible()).map((column) => column.id);
  const filename = `nano-${tableName}-${new Date().toISOString().slice(0, 10)}.csv`;
  void logAudit({ action: "export.csv", scope: `/data-explorer/${tableName}` });
  exportCsvFile(rows, filename, visible);
}

export function DataExplorer() {
  const navigate = useNavigate();
  const showChangelog = useFeatureFlag("DATA_CHANGELOG");
  const [tableName, setTableName] = useState<TableName>("participants");
  const participants = useParticipants();
  const runs = useRuns(200);
  const stages = useStages();
  const redcap = useRedcapEvents();

  const dataByTable: Record<TableName, RowRecord[]> = useMemo(() => ({
    participants: asRows(participants.data ?? []),
    runs: asRows(runs.data ?? []),
    stages: asRows(stages.data ?? []),
    redcap_events: asRows(redcap.data ?? []),
  }), [participants.data, redcap.data, runs.data, stages.data]);

  const columns = useMemo(
    () => makeColumns(tableName, navigate, showChangelog),
    [navigate, showChangelog, tableName],
  );
  const rows = dataByTable[tableName];
  const isLoading =
    tableName === "participants" ? participants.isLoading :
    tableName === "runs" ? runs.isLoading :
    tableName === "stages" ? stages.isLoading :
    redcap.isLoading;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Data Infrastructure</div>
          <div className={styles.h1}>Data Explorer</div>
          <div className={styles.sub}>{rows.length} visible rows · {tableName.replace("_", " ")}</div>
        </div>
        <Segmented<TableName>
          options={TABLE_OPTIONS}
          value={tableName}
          onChange={setTableName}
          ariaLabel="Choose data table"
        />
      </header>

      <Card pad={0} dataInsight="data-explorer-table">
        <div className={styles.tableWrap}>
          <DataTable<RowRecord>
            data={rows}
            columns={columns}
            storageKey={`data-explorer-${tableName}`}
            isLoading={isLoading}
            globalFilterPlaceholder={`Search ${tableName.replace("_", " ")}...`}
            toolbarEnd={({ columns: tableColumns, filteredRows }) => (
              <>
                <ColumnPanel<RowRecord> columns={tableColumns} />
                <Button
                  variant="secondary"
                  size="sm"
                  icon="download"
                  onClick={() => exportRows(tableName, filteredRows, tableColumns)}
                >
                  Export · CSV
                </Button>
              </>
            )}
          />
        </div>
      </Card>
    </div>
  );
}
