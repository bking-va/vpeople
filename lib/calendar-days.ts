export type HolidayDate = {
  date: string;
  isRecurring?: boolean | null;
};

/** Inclusive UTC date keys (YYYY-MM-DD) from date-only or timestamp strings. */
export function eachUtcDateInclusive(startInput: string, endInput: string): string[] {
  const start = toUtcDateOnly(startInput);
  const end = toUtcDateOnly(endInput);
  if (!start || !end) {
    throw new Error("Invalid start or end date");
  }
  if (end.getTime() < start.getTime()) {
    throw new Error("End date must be on or after start date");
  }
  const dates: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

/** Inclusive calendar-day count from date-only or timestamp strings (UTC date parts). */
export function calendarDaysInclusive(startInput: string, endInput: string): number {
  return eachUtcDateInclusive(startInput, endInput).length;
}

function holidayMonthDay(date: string): string | null {
  const key = String(date).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key.slice(5) : null;
}

export function isCompanyHoliday(
  dateKey: string,
  holidays: HolidayDate[]
): boolean {
  const key = String(dateKey).slice(0, 10);
  const monthDay = holidayMonthDay(key);
  for (const holiday of holidays) {
    const holidayKey = String(holiday.date).slice(0, 10);
    if (holidayKey === key) return true;
    if (holiday.isRecurring && monthDay && holidayMonthDay(holidayKey) === monthDay) {
      return true;
    }
  }
  return false;
}

/**
 * Pending/approved request day counts: inclusive calendar days minus company holidays.
 * Recurring holidays match on month-day. No weekend rule exists today.
 */
export function requestDaysExcludingHolidays(
  startInput: string,
  endInput: string,
  holidays: HolidayDate[]
): number {
  const dates = eachUtcDateInclusive(startInput, endInput);
  return dates.filter((date) => !isCompanyHoliday(date, holidays)).length;
}

/** Days of an approved request that have already been taken as of `asOf`, clipped to `year`. */
export function takenDaysInYear(
  startInput: string,
  endInput: string,
  year: number,
  asOf: Date = new Date(),
  holidays: HolidayDate[] = []
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
    return requestDaysExcludingHolidays(rangeStart, rangeEnd, holidays);
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
