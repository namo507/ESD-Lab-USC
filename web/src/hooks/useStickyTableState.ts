import { useCallback, useState } from "react";
import type { SortingState } from "@tanstack/react-table";

export interface StickyTableState {
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  sorting: SortingState;
  pageSize: number;
}

function normalizeState(value: unknown, defaults: StickyTableState): StickyTableState {
  if (!value || typeof value !== "object") return defaults;
  const candidate = value as Partial<StickyTableState>;
  return {
    columnVisibility:
      candidate.columnVisibility && typeof candidate.columnVisibility === "object"
        ? candidate.columnVisibility
        : defaults.columnVisibility,
    columnOrder: Array.isArray(candidate.columnOrder) ? candidate.columnOrder : defaults.columnOrder,
    sorting: Array.isArray(candidate.sorting) ? candidate.sorting : defaults.sorting,
    pageSize: typeof candidate.pageSize === "number" ? candidate.pageSize : defaults.pageSize,
  };
}

function storageKeyFor(storageKey: string): string {
  return `esd-table-${storageKey}`;
}

export function useStickyTableState(
  storageKey: string,
  defaults: StickyTableState,
): [StickyTableState, (next: StickyTableState) => void] {
  const [state, setState] = useState<StickyTableState>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.sessionStorage.getItem(storageKeyFor(storageKey));
      if (!raw) return defaults;
      return normalizeState(JSON.parse(raw) as unknown, defaults);
    } catch {
      return defaults;
    }
  });

  const update = useCallback((next: StickyTableState) => {
    setState(next);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(storageKeyFor(storageKey), JSON.stringify(next));
    } catch {
      /* Ignore quota and privacy-mode failures; table state is non-critical. */
    }
  }, [storageKey]);

  return [state, update];
}
