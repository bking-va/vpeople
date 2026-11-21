export const FX_SOURCE = "Bank of Canada";
export const FX_QUOTE_CURRENCY = "USD";
export const BOC_FX_DAILY_URL =
  "https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=1";

export type FxCadPerUnit = {
  currency: string;
  cadPerUnit: number;
  rateDate: string;
  source: string;
};

export type FxRateMap = Map<string, FxCadPerUnit>;

export type UsdEquivalent = {
  amountUsd: number;
  usdPerUnit: number;
  rateDate: string;
  source: string;
  fromCurrency: string;
  isIdentity: boolean;
};

const SERIES_RE = /^FX([A-Z]{3})CAD$/;
const MONEY_KEY_RE =
  /(amount|payrate|salary|bonus|commission|allowance|earnings|\bote\b|\bctc\b)/i;
const MONEY_KEY_EXCLUDE_RE = /(percent|pct|ratio|date|id$|type|status|currency|unit)/i;

export function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(trimmed)) return null;
  return trimmed;
}

export function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const numeric = String(value).replace(/[^0-9.-]/g, "");
  if (!numeric || numeric === "-" || numeric === ".") return null;
  const amount = Number.parseFloat(numeric);
  return Number.isFinite(amount) ? amount : null;
}

export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function parseBocDailyRates(payload: unknown): FxCadPerUnit[] {
  if (!payload || typeof payload !== "object") return [];
  const observations = (payload as { observations?: unknown }).observations;
  if (!Array.isArray(observations)) return [];

  const latest = new Map<string, FxCadPerUnit>();
  for (const row of observations) {
    if (!row || typeof row !== "object") continue;
    const rateDate = (row as { d?: unknown }).d;
    if (typeof rateDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rateDate)) {
      continue;
    }
    for (const [key, raw] of Object.entries(row as Record<string, unknown>)) {
      const match = key.match(SERIES_RE);
      if (!match) continue;
      const currency = match[1];
      if (currency === "CAD") continue;
      const value =
        raw && typeof raw === "object" && "v" in raw
          ? (raw as { v?: unknown }).v
          : raw;
      const cadPerUnit =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Number.parseFloat(value)
            : NaN;
      if (!Number.isFinite(cadPerUnit) || cadPerUnit <= 0) continue;
      const existing = latest.get(currency);
      if (!existing || rateDate > existing.rateDate) {
        latest.set(currency, {
          currency,
          cadPerUnit,
          rateDate,
          source: FX_SOURCE,
        });
      }
    }
  }
  return Array.from(latest.values()).sort((a, b) =>
    a.currency.localeCompare(b.currency)
  );
}

export function fxRateMapFromRows(rows: FxCadPerUnit[]): FxRateMap {
  const map: FxRateMap = new Map();
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    if (!currency || !Number.isFinite(row.cadPerUnit) || row.cadPerUnit <= 0) {
      continue;
    }
    const existing = map.get(currency);
    if (!existing || row.rateDate > existing.rateDate) {
      map.set(currency, {
        currency,
        cadPerUnit: row.cadPerUnit,
        rateDate: row.rateDate,
        source: row.source || FX_SOURCE,
      });
    }
  }
  return map;
}

function usdPerUnitFor(
  fromCurrency: string,
  rates: FxRateMap
): { usdPerUnit: number; rateDate: string; source: string } | null {
  if (fromCurrency === FX_QUOTE_CURRENCY) {
    const usd = rates.get("USD");
    return {
      usdPerUnit: 1,
      rateDate: usd?.rateDate ?? "",
      source: usd?.source ?? FX_SOURCE,
    };
  }
  const usdCad = rates.get("USD");
  if (!usdCad) return null;
  if (fromCurrency === "CAD") {
    return {
      usdPerUnit: 1 / usdCad.cadPerUnit,
      rateDate: usdCad.rateDate,
      source: usdCad.source,
    };
  }
  const fromCad = rates.get(fromCurrency);
  if (!fromCad) return null;
  const rateDate =
    fromCad.rateDate <= usdCad.rateDate ? fromCad.rateDate : usdCad.rateDate;
  return {
    usdPerUnit: fromCad.cadPerUnit / usdCad.cadPerUnit,
    rateDate,
    source: fromCad.source || usdCad.source,
  };
}

export function convertToUsd(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
  rates: FxRateMap
): UsdEquivalent | null {
  const parsed = parseAmount(amount);
  if (parsed === null) return null;
  const fromCurrency = normalizeCurrency(currency) || "CAD";
  const converted = usdPerUnitFor(fromCurrency, rates);
  if (!converted) return null;
  const isIdentity = fromCurrency === FX_QUOTE_CURRENCY;
  return {
    amountUsd: isIdentity ? roundUsd(parsed) : roundUsd(parsed * converted.usdPerUnit),
    usdPerUnit: converted.usdPerUnit,
    rateDate: converted.rateDate,
    source: converted.source,
    fromCurrency,
    isIdentity,
  };
}

/**
 * USD equivalent of a pay figure the caller has already authorized.
 * `visible: false` always returns null so USD cannot leak past the same
 * compensation checks as the original amount.
 */
export function usdEquivalentForVisiblePay(opts: {
  visible: boolean;
  amount: string | number | null | undefined;
  currency?: string | null;
  rates: FxRateMap;
}): UsdEquivalent | null {
  if (!opts.visible) return null;
  return convertToUsd(opts.amount, opts.currency, opts.rates);
}

export function usdEquivalentAttribution(
  usd: UsdEquivalent,
  fromCurrency: string = usd.fromCurrency
): string {
  const perUnit = usd.usdPerUnit >= 1 ? usd.usdPerUnit.toFixed(4) : usd.usdPerUnit.toPrecision(4);
  return `≈ USD at 1 ${fromCurrency} = ${perUnit} USD on ${usd.rateDate}, ${usd.source}`;
}

export function csvUsdAmount(usd: UsdEquivalent | null | undefined): string {
  if (!usd || usd.isIdentity) return "";
  return usd.amountUsd.toFixed(2);
}

export function isCompensationTableMoneyField(key: string): boolean {
  if (!MONEY_KEY_RE.test(key)) return false;
  return !MONEY_KEY_EXCLUDE_RE.test(key);
}

export function compensationTableFieldCurrency(
  rowData: Record<string, unknown>,
  value: unknown
): string {
  const fromRow = normalizeCurrency(
    typeof rowData.currency === "string" ? rowData.currency : null
  );
  if (fromRow) return fromRow;
  if (typeof value === "string") {
    const match = value.trim().match(/\b([A-Z]{3})\b/);
    const fromValue = normalizeCurrency(match?.[1]);
    if (fromValue) return fromValue;
  }
  return "CAD";
}

export function collectCompensationCurrencies(opts: {
  compensation?: Array<{ currency?: string | null }>;
  bonuses?: Array<{ currency?: string | null }>;
  tableRows?: Array<{ rowData?: Record<string, unknown> | null }>;
}): string[] {
  const found = new Set<string>();
  for (const row of opts.compensation ?? []) {
    const currency = normalizeCurrency(row.currency) || "CAD";
    found.add(currency);
  }
  for (const row of opts.bonuses ?? []) {
    const currency = normalizeCurrency(row.currency) || "CAD";
    found.add(currency);
  }
  for (const row of opts.tableRows ?? []) {
    const data = row.rowData ?? {};
    const rowCurrency = normalizeCurrency(
      typeof data.currency === "string" ? data.currency : null
    );
    if (rowCurrency) found.add(rowCurrency);
    for (const [key, value] of Object.entries(data)) {
      if (!isCompensationTableMoneyField(key)) continue;
      if (typeof value === "string") {
        const match = value.trim().match(/\b([A-Z]{3})\b/);
        const fromValue = normalizeCurrency(match?.[1]);
        if (fromValue) found.add(fromValue);
      }
      if (rowCurrency) found.add(rowCurrency);
      else found.add("CAD");
    }
  }
  return Array.from(found).sort();
}
