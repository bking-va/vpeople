import { accrualPeriodKey, accrualAmount } from "@/lib/time-off-accrual-period";

describe("accrual period keys", () => {
  test("monthly keys are YYYY-MM", () => {
    expect(accrualPeriodKey("monthly", new Date("2027-03-15T12:00:00Z"))).toBe("2027-03");
  });

  test("annual keys are YYYY", () => {
    expect(accrualPeriodKey("annual", new Date("2027-03-15T12:00:00Z"))).toBe("2027");
    expect(accrualPeriodKey("per_year", new Date("2027-12-31T12:00:00Z"))).toBe("2027");
  });

  test("none skips accrual", () => {
    expect(accrualPeriodKey("none", new Date("2027-03-15T12:00:00Z"))).toBeNull();
    expect(accrualAmount(10, "none")).toBe(0);
  });

  test("amount is the per-period rate (15/annual or 1.25/monthly)", () => {
    expect(accrualAmount(15, "annual")).toBe(15);
    expect(accrualAmount(1.25, "monthly")).toBe(1.25);
  });

  test("same month produces the same key (idempotent period)", () => {
    const a = accrualPeriodKey("monthly", new Date("2027-03-01T00:00:00Z"));
    const b = accrualPeriodKey("monthly", new Date("2027-03-31T23:00:00Z"));
    expect(a).toBe(b);
  });
});
