import { Button } from "@/components/primitives";
import styles from "./DataTable.module.css";

export interface PaginationBarProps {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (idx: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

function pageItems(pageIndex: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, idx) => idx);
  const pages = new Set<number>([0, pageCount - 1, pageIndex - 1, pageIndex, pageIndex + 1]);
  const sorted = Array.from(pages)
    .filter((idx) => idx >= 0 && idx < pageCount)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  sorted.forEach((idx) => {
    const prev = items[items.length - 1];
    if (typeof prev === "number" && idx - prev > 1) items.push("ellipsis");
    items.push(idx);
  });
  return items;
}

export function PaginationBar({
  pageIndex,
  pageCount,
  pageSize,
  totalRows,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}: PaginationBarProps) {
  const safePageCount = Math.max(1, pageCount);
  const start = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(totalRows, (pageIndex + 1) * pageSize);
  const canPrev = pageIndex > 0;
  const canNext = pageIndex + 1 < safePageCount;

  return (
    <div className={styles.pagination}>
      <div className={styles.pageButtons}>
        <Button variant="ghost" size="sm" icon="arrow-left" disabled={!canPrev} onClick={() => onPageChange(pageIndex - 1)}>
          Prev
        </Button>
        <span className={styles.mobilePage}>Page {pageIndex + 1} of {safePageCount}</span>
        {pageItems(pageIndex, safePageCount).map((item, idx) => (
          item === "ellipsis" ? (
            <span key={`ellipsis-${idx}`} className={styles.ellipsis}>…</span>
          ) : (
            <Button
              key={item}
              variant={item === pageIndex ? "secondary" : "ghost"}
              size="sm"
              className={styles.numberButton}
              onClick={() => onPageChange(item)}
              aria-current={item === pageIndex ? "page" : undefined}
            >
              {item + 1}
            </Button>
          )
        ))}
        <Button variant="ghost" size="sm" iconRight="arrow-right" disabled={!canNext} onClick={() => onPageChange(pageIndex + 1)}>
          Next
        </Button>
      </div>

      <div className={styles.toolbarEnd}>
        <span className={styles.summary}>Showing {start}-{end} of {totalRows} rows</span>
        <label className={styles.pageSize}>
          Rows
          <select
            className={styles.select}
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
