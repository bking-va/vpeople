export type HolidayDate = {
  date: string;
  isRecurring?: boolean | null;
};

/** Inclusive calendar-day cap for a single time-off request (leap year). */
export const MAX_TIME_OFF_SPAN_DAYS = 366;

export class TimeOffSpanError extends Error {
  constructor(message = `Time-off request cannot exceed ${MAX_TIME_OFF_SPAN_DAYS} days`) {
    super(message);
    this.name = "TimeOffSpanError";
  }
}

/** Inclusive UTC date count from date-only or timestamp strings. Does not allocate a day list. */
export function inclusiveUtcDayCount(startInput: string, endInput: string): number {
  const start = toUtcDateOnly(startInput);
  const end = toUtcDateOnly(endInput);
  if (!start || !end) {
    throw new Error("Invalid start or end date");
  }
  if (end.getTime() < start.getTime()) {
    throw new Error("End date must be on or after start date");
  }
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/** Reject oversized spans before holiday scans or per-day allocation. */
export function assertTimeOffSpan(startInput: string, endInput: string): number {
  const days = inclusiveUtcDayCount(startInput, endInput);
  if (days > MAX_TIME_OFF_SPAN_DAYS) {
    throw new TimeOffSpanError();
  }
  return days;
}

/** Inclusive calendar-day count from date-only or timestamp strings (UTC date parts). */
export function calendarDaysInclusive(startInput: string, endInput: string): number {
  return inclusiveUtcDayCount(startInput, endInput);
}

function holidayMonthDay(date: string): string | null {
  const key = String(date).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key.slice(5) : null;
}

function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
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

/** Count distinct holiday dates in [startKey, endKey] without allocating every calendar day. */
function holidayHitsInRange(
  startKey: string,
  endKey: string,
  holidays: HolidayDate[]
): number {
  const hits = new Set<string>();
  const startYear = Number(startKey.slice(0, 4));
  const endYear = Number(endKey.slice(0, 4));
  for (const holiday of holidays) {
    const holidayKey = String(holiday.date).slice(0, 10);
    if (holidayKey >= startKey && holidayKey <= endKey) {
      hits.add(holidayKey);
    }
    if (!holiday.isRecurring) continue;
    const monthDay = holidayMonthDay(holidayKey);
    if (!monthDay) continue;
    for (let year = startYear; year <= endYear; year++) {
      const candidate = `${year}-${monthDay}`;
      if (candidate >= startKey && candidate <= endKey) {
        hits.add(candidate);
      }
    }
  }
  return hits.size;
}

/**
 * Pending/approved request day counts: inclusive calendar days minus company holidays.
 * Recurring holidays match on month-day. No weekend rule exists today.
 * Caps the span before scanning holidays.
 */
export function requestDaysExcludingHolidays(
  startInput: string,
  endInput: string,
  holidays: HolidayDate[]
): number {
  const total = assertTimeOffSpan(startInput, endInput);
  const start = toUtcDateOnly(startInput);
  const end = toUtcDateOnly(endInput);
  if (!start || !end) {
    throw new Error("Invalid start or end date");
  }
  const hits = holidayHitsInRange(utcDateKey(start), utcDateKey(end), holidays);
  return total - hits;
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
  } catch (error) {
    if (error instanceof TimeOffSpanError) {
      throw error;
    }
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
