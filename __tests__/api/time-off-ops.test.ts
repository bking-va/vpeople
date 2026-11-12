import {
  requestDaysExcludingHolidays,
  calendarDaysInclusive,
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
