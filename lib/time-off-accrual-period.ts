/**
 * Period key used for idempotent accrual. Same key + same balance is applied at most once.
 */
export function accrualPeriodKey(period: string | null | undefined, asOf: Date): string | null {
  if (!period || period === "none") return null;

  const { year: isoYear, week } = isoWeekAndYear(asOf);
  const month = String(asOf.getUTCMonth() + 1).padStart(2, "0");
  const gregorianYear = asOf.getUTCFullYear();

  if (period === "annual" || period === "per_year") {
    return `${gregorianYear}`;
  }
  if (period === "biweekly") {
    // Fortnight key uses ISO week-year (weeks 1-2 → F01) so a daily cron
    // does not credit twice around New Year or once per ISO week.
    const fortnight = Math.ceil(week / 2);
    return `${isoYear}-F${fortnight.toString().padStart(2, "0")}`;
  }
  return `${gregorianYear}-${month}`;
}

/** Previous ISO-week keys that map to the same biweekly period as `asOf`. */
export function legacyBiweeklyPeriodKeys(asOf: Date): string[] {
  const { year: isoYear, week } = isoWeekAndYear(asOf);
  const gregorianYear = asOf.getUTCFullYear();
  const weekA = week % 2 === 0 ? week - 1 : week;
  const weekB = weekA + 1;
  const years = new Set([isoYear, gregorianYear]);
  const keys: string[] = [];
  for (const y of years) {
    keys.push(`${y}-W${weekA.toString().padStart(2, "0")}`);
    keys.push(`${y}-W${weekB.toString().padStart(2, "0")}`);
  }
  return keys;
}

export function accrualAmount(rate: number, period: string | null | undefined): number {
  if (!period || period === "none" || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return rate;
}

function isoWeekAndYear(date: Date): { year: number; week: number } {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const isoYear = tmp.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: isoYear, week };
}
