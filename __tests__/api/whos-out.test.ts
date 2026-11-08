import { isOutOnDate } from "@/lib/date-overlap";

describe("Who's Out date overlap", () => {
  test("includes the start and end dates", () => {
    expect(isOutOnDate("2027-06-01", "2027-06-03", "2027-06-01")).toBe(true);
    expect(isOutOnDate("2027-06-01", "2027-06-03", "2027-06-03")).toBe(true);
    expect(isOutOnDate("2027-06-01", "2027-06-03", "2027-06-02")).toBe(true);
  });

  test("excludes dates outside the range", () => {
    expect(isOutOnDate("2027-06-01", "2027-06-03", "2027-05-31")).toBe(false);
    expect(isOutOnDate("2027-06-01", "2027-06-03", "2027-06-04")).toBe(false);
  });
});
