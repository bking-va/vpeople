import { turnoverToCsv } from "@/lib/reports/turnover-format";

describe("turnoverToCsv", () => {
  test("emits summary metrics and monthly rows", () => {
    const csv = turnoverToCsv({
      activeHeadcount: 40,
      hires: 6,
      terminations: 2,
      turnoverRate: 5.0,
      byMonth: [
        { month: "2026-10", hires: 1, terms: 0 },
        { month: "2026-11", hires: 0, terms: 1 },
      ],
    });

    expect(csv).toContain('"Active Headcount","40"');
    expect(csv).toContain('"Hires (12mo)","6"');
    expect(csv).toContain('"Terminations (12mo)","2"');
    expect(csv).toContain('"Turnover Rate %","5"');
    expect(csv).toContain('"2026-10","1","0"');
    expect(csv).toContain('"2026-11","0","1"');
  });
});
