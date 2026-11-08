export type HeadcountReport = {
  totalActive: number;
  terminated: number;
  byDepartment: { departmentId: number | null; department: string | null; count: number }[];
  byLocation: { locationId: number | null; location: string | null; count: number }[];
  byStatus: { employmentStatus: string; count: number }[];
};

export function headcountToCsv(report: HeadcountReport): string {
  const lines = ["Category,Name,Count"];
  for (const row of report.byDepartment) {
    lines.push(
      `Department,"${(row.department || "No Department").replace(/"/g, '""')}",${row.count}`
    );
  }
  for (const row of report.byLocation) {
    lines.push(
      `Location,"${(row.location || "No Location").replace(/"/g, '""')}",${row.count}`
    );
  }
  for (const row of report.byStatus) {
    lines.push(`Status,"${row.employmentStatus}",${row.count}`);
  }
  lines.push(`Total,Active,${report.totalActive}`);
  return lines.join("\n") + "\n";
}
