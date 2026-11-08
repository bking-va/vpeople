export type TurnoverCsvInput = {
  activeHeadcount: number;
  hires: number;
  terminations: number;
  turnoverRate: number;
  byMonth: Array<{ month: string; hires: number; terms: number }>;
};

export function turnoverToCsv(report: TurnoverCsvInput): string {
  const lines = [
    "Metric,Value",
    `Active Headcount,${report.activeHeadcount}`,
    `Hires (12mo),${report.hires}`,
    `Terminations (12mo),${report.terminations}`,
    `Turnover Rate %,${report.turnoverRate}`,
    "",
    "Month,Hires,Terminations",
    ...report.byMonth.map((row) => `${row.month},${row.hires},${row.terms}`),
  ];
  return lines.join("\n") + "\n";
}
