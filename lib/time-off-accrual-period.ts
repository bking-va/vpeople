/**
 * Period key used for idempotent accrual. Same key + same balance is applied at most once.
 */
export function accrualPeriodKey(period: string | null | undefined, asOf: Date): string | null {
  if (!period || period === "none") return null;

  const year = asOf.getUTCFullYear();
  const month = String(asOf.getUTCMonth() + 1).padStart(2, "0");

  if (period === "annual" || period === "per_year") {
    return `${year}`;
  }
  if (period === "biweekly") {
    // Fortnight key (ISO weeks 1-2 → F01) so a daily cron does not credit
    // the same biweekly rate once per ISO week.
    const fortnight = Math.ceil(isoWeek(asOf) / 2);
    return `${year}-F${fortnight.toString().padStart(2, "0")}`;
  }
  return `${year}-${month}`;
}

export function accrualAmount(rate: number, period: string | null | undefined): number {
  if (!period || period === "none" || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return rate;
}

function isoWeek(date: Date): number {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
