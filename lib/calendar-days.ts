/** Inclusive calendar-day count from date-only or timestamp strings (UTC date parts). */
export function calendarDaysInclusive(startInput: string, endInput: string): number {
  const start = toUtcDateOnly(startInput);
  const end = toUtcDateOnly(endInput);
  if (!start || !end) {
    throw new Error("Invalid start or end date");
  }
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days < 1) {
    throw new Error("End date must be on or after start date");
  }
  return days;
}

/** Days of an approved request that have already been taken as of `asOf`, clipped to `year`. */
export function takenDaysInYear(
  startInput: string,
  endInput: string,
  year: number,
  asOf: Date = new Date()
): number {
  const start = String(startInput).slice(0, 10);
  const end = String(endInput).slice(0, 10);
  const asOfKey = asOf.toISOString().slice(0, 10);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const rangeStart = start > yearStart ? start : yearStart;
  const rangeEnd = [end, yearEnd, asOfKey].sort()[0];
  if (rangeEnd < rangeStart) return 0;
  try {
    return calendarDaysInclusive(rangeStart, rangeEnd);
  } catch {
    return 0;
  }
}

function toUtcDateOnly(value: string): Date | null {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
