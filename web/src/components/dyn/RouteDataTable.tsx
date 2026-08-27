import { useState } from "react";
import { Button } from "@/components/primitives";
import styles from "./DynamicRoutes.module.css";

interface RouteDataTableProps {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

export function RouteDataTable({ caption, columns, rows }: RouteDataTableProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className={styles.controlBar}>
        <Button
          variant="secondary"
          size="sm"
          icon={open ? "table-cells-split" : "table-2"}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? "Hide data table" : "Show data table"}
        </Button>
      </div>
      {open && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} className={styles.th} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={styles.td}>
                      {cell ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
