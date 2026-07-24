export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => (row[col] ?? "").length)),
  );
  const renderRow = (cells: string[]): string =>
    cells.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join("  ").trimEnd();

  return [renderRow(headers), renderRow(widths.map((w) => "-".repeat(w))), ...rows.map(renderRow)].join(
    "\n",
  );
}
