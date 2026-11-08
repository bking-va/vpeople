import { isRaiseOverdue, raiseCutoffDate } from "@/lib/reports/raise-overdue";

describe("people without raise cutoff", () => {
  test("cutoff is 12 months before as-of", () => {
    expect(raiseCutoffDate(new Date("2026-11-08T12:00:00Z"), 12)).toBe("2025-11-08");
  });

  test("missing or old effective dates are overdue", () => {
    expect(isRaiseOverdue(null, "2025-11-08")).toBe(true);
    expect(isRaiseOverdue("2024-01-01", "2025-11-08")).toBe(true);
    expect(isRaiseOverdue("2026-01-01", "2025-11-08")).toBe(false);
  });
});
