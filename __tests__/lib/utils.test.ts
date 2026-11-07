import { formatDate, formatCurrency, calculateTenure } from "@/lib/utils";

describe("Utils", () => {
  describe("formatDate", () => {
    it("should format date string correctly", () => {
      const result = formatDate("2020-01-15");
      expect(result).toMatch(/Jan.*15.*2020/);
    });

    it("should format Date object correctly", () => {
      const result = formatDate(new Date("2020-01-15"));
      expect(result).toMatch(/Jan.*15.*2020/);
    });

    it("should return empty string for null/undefined", () => {
      expect(formatDate(null)).toBe("");
      expect(formatDate(undefined)).toBe("");
    });
  });

  describe("formatCurrency", () => {
    it("should format number as CAD by default", () => {
      const result = formatCurrency(100000);
      expect(result).toContain("100,000");
    });

    it("should format string number correctly", () => {
      const result = formatCurrency("75000.50", "CAD");
      expect(result).toContain("75,000.50");
    });

    it("should handle different currencies", () => {
      const result = formatCurrency(100000, "USD");
      expect(result).toMatch(/\$|USD/);
    });
  });

  describe("calculateTenure", () => {
    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-11-07"));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it("should calculate years and months correctly", () => {
      const result = calculateTenure("2020-01-15");
      expect(result).toContain("year");
      expect(result).toContain("month");
    });

    it("should handle less than a year", () => {
      const result = calculateTenure("2026-05-01");
      expect(result).toMatch(/6 months?/);
      expect(result).not.toContain("year");
    });

    it("should handle exact years", () => {
      const result = calculateTenure("2018-11-07");
      expect(result).toMatch(/8 years?/);
      expect(result).not.toContain("month");
    });

    it("should return empty string for null", () => {
      expect(calculateTenure(null)).toBe("");
    });
  });
});
