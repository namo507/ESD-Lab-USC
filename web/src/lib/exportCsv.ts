function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = Array.isArray(value) || typeof value === "object"
    ? JSON.stringify(value)
    : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(text: string, filename: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns?: string[]): string {
  const headers = columns ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

export function exportCsvFile<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  columns?: string[],
): void {
  downloadText(toCsv(rows, columns), filename, "text/csv;charset=utf-8");
}
