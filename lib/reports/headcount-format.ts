import { csvRow } from "@/lib/csv";

export type HeadcountReport = {
  totalActive: number;
  terminated: number;
  byDepartment: { departmentId: number | null; department: string | null; count: number }[];
  byLocation: { locationId: number | null; location: string | null; count: number }[];
  byStatus: { employmentStatus: string; count: number }[];
};

export function headcountToCsv(report: HeadcountReport): string {
  const lines = [csvRow(["Category", "Name", "Count"])];
  for (const row of report.byDepartment) {
    lines.push(csvRow(["Department", row.department || "No Department", row.count]));
  }
  for (const row of report.byLocation) {
    lines.push(csvRow(["Location", row.location || "No Location", row.count]));
  }
  for (const row of report.byStatus) {
    lines.push(csvRow(["Status", row.employmentStatus, row.count]));
  }
  lines.push(csvRow(["Total", "Active", report.totalActive]));
  return lines.join("\n") + "\n";
}
