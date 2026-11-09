const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Escape a CSV field and neutralize spreadsheet formula injection. */
export function csvField(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (FORMULA_PREFIX.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(",");
}
