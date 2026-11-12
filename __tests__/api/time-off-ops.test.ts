import {
  requestDaysExcludingHolidays,
  calendarDaysInclusive,
  takenDaysInYear,
  assertTimeOffSpan,
  MAX_TIME_OFF_SPAN_DAYS,
  TimeOffSpanError,
} from "@/lib/calendar-days";
import { parseAdjustmentAmount } from "@/lib/time-off-adjustments";
import { canManageTimeOffOperations } from "@/lib/authz";

describe("time-off request days exclude company holidays", () => {
  const holidays = [
    { date: "2026-12-25", isRecurring: true },
    { date: "2026-12-26", isRecurring: false },
  ];

  test("drops exact holiday dates from the inclusive range", () => {
    expect(calendarDaysInclusive("2026-12-24", "2026-12-26")).toBe(3);
    expect(
      requestDaysExcludingHolidays("2026-12-24", "2026-12-26", holidays)
    ).toBe(1);
  });

  test("recurring holidays match month-day in other years", () => {
    expect(
      requestDaysExcludingHolidays("2027-12-24", "2027-12-25", holidays)
    ).toBe(1);
  });

  test("a range that is only holidays counts as zero days", () => {
    expect(
      requestDaysExcludingHolidays("2026-12-25", "2026-12-26", holidays)
    ).toBe(0);
  });

  test("rejects oversized spans before counting days", () => {
    expect(() => assertTimeOffSpan("2020-01-01", "2030-01-01")).toThrow(
      TimeOffSpanError
    );
    expect(() =>
      requestDaysExcludingHolidays("2020-01-01", "2030-01-01", holidays)
    ).toThrow(TimeOffSpanError);
    expect(assertTimeOffSpan("2026-01-01", "2026-01-02")).toBe(2);
    expect(MAX_TIME_OFF_SPAN_DAYS).toBe(366);
  });

  test("recurring Feb 29 is not invented in non-leap years", () => {
    const leapDay = [{ date: "2024-02-29", isRecurring: true }];
    expect(calendarDaysInclusive("2025-02-28", "2025-03-01")).toBe(2);
    expect(
      requestDaysExcludingHolidays("2025-02-28", "2025-03-01", leapDay)
    ).toBe(2);
    expect(calendarDaysInclusive("2024-02-28", "2024-03-01")).toBe(3);
    expect(
      requestDaysExcludingHolidays("2024-02-28", "2024-03-01", leapDay)
    ).toBe(2);
    const asOfNonLeap = new Date("2025-12-31T12:00:00Z");
    const asOfLeap = new Date("2024-12-31T12:00:00Z");
    expect(
      takenDaysInYear("2025-02-28", "2025-03-01", 2025, asOfNonLeap, leapDay)
    ).toBe(2);
    expect(
      takenDaysInYear("2024-02-28", "2024-03-01", 2024, asOfLeap, leapDay)
    ).toBe(2);
  });

  test("Time Off Used elapsed days exclude the same holidays", () => {
    const asOf = new Date("2026-12-31T12:00:00Z");
    expect(takenDaysInYear("2026-12-24", "2026-12-26", 2026, asOf)).toBe(3);
    expect(
      takenDaysInYear("2026-12-24", "2026-12-26", 2026, asOf, holidays)
    ).toBe(1);
  });
});

describe("manual balance adjustment helpers", () => {
  test("rejects zero, NaN, and empty amounts", () => {
    expect(parseAdjustmentAmount(0)).toBeNull();
    expect(parseAdjustmentAmount("0")).toBeNull();
    expect(parseAdjustmentAmount("nope")).toBeNull();
    expect(parseAdjustmentAmount("")).toBeNull();
    expect(parseAdjustmentAmount(-1.5)).toBe(-1.5);
    expect(parseAdjustmentAmount("2")).toBe(2);
  });

  test("only HR or full_admin may write the ledger or holidays", () => {
    expect(
      canManageTimeOffOperations({ accessLevel: "full_admin" })
    ).toBe(true);
    expect(
      canManageTimeOffOperations({
        accessLevel: "employee",
        canManageUsers: true,
      })
    ).toBe(true);
    expect(
      canManageTimeOffOperations({
        accessLevel: "manager",
        canManageUsers: false,
      })
    ).toBe(false);
    expect(
      canManageTimeOffOperations({ accessLevel: "regional_view" })
    ).toBe(false);
  });
});
