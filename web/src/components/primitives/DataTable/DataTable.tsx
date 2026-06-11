import { useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type Table,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import { Badge, Icon } from "@/components/primitives";
import type { BadgeKind } from "@/components/primitives";
import { useStickyTableState, type StickyTableState } from "@/hooks/useStickyTableState";
import { PaginationBar } from "./PaginationBar";
import styles from "./DataTable.module.css";

export interface DataTableToolbarContext<TData> {
  table: Table<TData>;
  columns: Array<Column<TData, unknown>>;
  filteredRows: TData[];
}

export interface DataTableProps<TData extends object> {
  data: TData[];
  columns: Array<ColumnDef<TData>>;
  pageSize?: number;
  storageKey?: string;
  isLoading?: boolean;
  globalFilterPlaceholder?: string;
  toolbarEnd?: (context: DataTableToolbarContext<TData>) => ReactNode;
}

const NUMERIC_COLUMNS = new Set(["rmssd", "hf", "cga_wks", "windows", "rate", "inflight", "queued", "done", "fail", "duration"]);

const BADGE_BY_VALUE: Record<string, BadgeKind> = {
  pass: "ok",
  pending: "pending",
  reject: "fail",
  running: "info",
  queued: "neutral",
  done: "ok",
  fail: "fail",
  ok: "ok",
  warn: "warn",
  VPT: "vpt",
  ASIB: "asib",
  TD: "td",
  orienting: "info",
  sustained: "ok",
  inattention: "pending",
  termination: "fail",
};

function resolveUpdater<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(current) : updater;
}

function defaultSticky(pageSize: number): StickyTableState {
  return {
    columnVisibility: {},
    columnOrder: [],
    sorting: [],
    pageSize,
  };
}

function sortIcon(sort: false | "asc" | "desc"): string {
  if (sort === "asc") return "arrow-up";
  if (sort === "desc") return "arrow-down";
  return "arrow-up-down";
}

function renderValue(columnId: string, value: unknown): ReactNode {
  if (value == null || value === "") {
    return <span className={styles.nullCell}>—</span>;
  }
  if (typeof value === "number" && NUMERIC_COLUMNS.has(columnId)) {
    return value.toFixed(2);
  }
  if (typeof value === "string" && BADGE_BY_VALUE[value]) {
    return <Badge kind={BADGE_BY_VALUE[value]} size="sm">{value}</Badge>;
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function DataTable<TData extends object>({
  data,
  columns,
  pageSize = 25,
  storageKey = "default",
  isLoading = false,
  globalFilterPlaceholder = "Search table...",
  toolbarEnd,
}: DataTableProps<TData>) {
  const [sticky, setSticky] = useStickyTableState(storageKey, defaultSticky(pageSize));
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: sticky.pageSize || pageSize,
  });

  const sorting = sticky.sorting;
  const columnVisibility = sticky.columnVisibility as VisibilityState;
  const columnOrder = sticky.columnOrder;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      columnFilters,
      globalFilter,
      pagination,
    },
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = resolveUpdater(updater, sorting);
      setSticky({ ...sticky, sorting: next });
    },
    onColumnVisibilityChange: (updater: Updater<VisibilityState>) => {
      const next = resolveUpdater(updater, columnVisibility);
      setSticky({ ...sticky, columnVisibility: next });
    },
    onColumnOrderChange: (updater: Updater<string[]>) => {
      const next = resolveUpdater(updater, columnOrder);
      setSticky({ ...sticky, columnOrder: next });
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater: Updater<PaginationState>) => {
      const next = resolveUpdater(updater, pagination);
      setPagination(next);
      if (next.pageSize !== sticky.pageSize) {
        setSticky({ ...sticky, pageSize: next.pageSize });
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const filteredRows = useMemo(
    () => table.getFilteredRowModel().rows.map((row) => row.original),
    [table],
  );

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={globalFilter}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          placeholder={globalFilterPlaceholder}
          aria-label="Search table"
        />
        <div className={styles.toolbarEnd}>
          {toolbarEnd?.({
            table,
            columns: table.getAllLeafColumns(),
            filteredRows,
          })}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className={styles.th} scope="col">
                    {header.isPlaceholder ? null : (
                      <>
                        <button
                          type="button"
                          className={styles.headButton}
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!header.column.getCanSort()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <Icon name={sortIcon(header.column.getIsSorted())} size={12} />
                        </button>
                        {header.column.getCanFilter() && (
                          <input
                            className={styles.columnFilter}
                            value={(header.column.getFilterValue() as string | undefined) ?? ""}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => header.column.setFilterValue(event.target.value)}
                            placeholder="filter"
                            aria-label={`Filter ${header.column.id}`}
                          />
                        )}
                      </>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className={styles.state} colSpan={table.getAllLeafColumns().length}>Loading rows...</td>
              </tr>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={styles.row}>
                  {row.getVisibleCells().map((cell) => {
                    const columnId = cell.column.id;
                    const isNumeric = typeof cell.getValue() === "number" && NUMERIC_COLUMNS.has(columnId);
                    const className = `${styles.td} ${isNumeric ? styles.numericCell : ""}`;
                    return (
                      <td key={cell.id} className={className}>
                        {cell.column.columnDef.cell
                          ? flexRender(cell.column.columnDef.cell, cell.getContext())
                          : renderValue(columnId, cell.getValue())}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td className={styles.state} colSpan={table.getAllLeafColumns().length}>No rows match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        pageIndex={pagination.pageIndex}
        pageCount={table.getPageCount()}
        pageSize={pagination.pageSize}
        totalRows={filteredRows.length}
        onPageChange={(idx) => table.setPageIndex(Math.max(0, Math.min(idx, table.getPageCount() - 1)))}
        onPageSizeChange={(size) => table.setPageSize(size)}
      />
    </div>
  );
}
