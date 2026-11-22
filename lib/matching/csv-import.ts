export type CustomerLocationInput = {
  label: string;
  city: string | null;
  province: string | null;
  country: string;
  postalCode: string | null;
  source: "manual" | "csv";
  externalId: string | null;
};

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Parse a CSV of customer locations. Columns: label, city, province, country, postal_code, external_id? */
export function parseCustomerLocationCsv(text: string): CustomerLocationInput[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const idx = {
    label: headerIndex(header, ["label", "name", "region"]),
    city: headerIndex(header, ["city", "town"]),
    province: headerIndex(header, ["province", "state", "region_admin"]),
    country: headerIndex(header, ["country"]),
    postal: headerIndex(header, ["postal_code", "postal", "zip", "zipcode", "pin"]),
    externalId: headerIndex(header, ["external_id", "crm_id", "id"]),
  };
  if (idx.label < 0 || idx.country < 0) {
    throw new Error("CSV must include label and country columns");
  }
  const out: CustomerLocationInput[] = [];
  for (const row of rows.slice(1)) {
    const label = sanitizeCell(row[idx.label] || "");
    const country = sanitizeCell(row[idx.country] || "");
    if (!label || !country) continue;
    out.push({
      label,
      city: nullable(row, idx.city),
      province: nullable(row, idx.province),
      country,
      postalCode: nullable(row, idx.postal),
      source: "csv",
      externalId: nullable(row, idx.externalId),
    });
  }
  return out;
}

function headerIndex(header: string[], names: string[]): number {
  for (const name of names) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

function nullable(row: string[], index: number): string | null {
  if (index < 0) return null;
  const value = sanitizeCell(row[index] || "");
  return value || null;
}

function sanitizeCell(value: string): string {
  let s = value.trim();
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  return s.slice(0, 200);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
