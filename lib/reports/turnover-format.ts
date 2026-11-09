import { csvRow } from "@/lib/csv";

export type TurnoverCsvInput = {
  activeHeadcount: number;
  hires: number;
  terminations: number;
  turnoverRate: number;
  byMonth: Array<{ month: string; hires: number; terms: number }>;
};

export function turnoverToCsv(report: TurnoverCsvInput): string {
  const lines = [
    csvRow(["Metric", "Value"]),
    csvRow(["Active Headcount", report.activeHeadcount]),
    csvRow(["Hires (12mo)", report.hires]),
    csvRow(["Terminations (12mo)", report.terminations]),
    csvRow(["Turnover Rate %", report.turnoverRate]),
    "",
    csvRow(["Month", "Hires", "Terminations"]),
    ...report.byMonth.map((row) => csvRow([row.month, row.hires, row.terms])),
  ];
  return lines.join("\n") + "\n";
}
