import { NextRequest, NextResponse } from "next/server";
import { csvRow } from "@/lib/csv";
import { getHeadcountReport, headcountToCsv } from "@/lib/reports/headcount";
import { getTurnoverReport } from "@/lib/reports/turnover";
import { turnoverToCsv } from "@/lib/reports/turnover-format";
import {
  getPayByTitleReport,
  getPayByDepartmentReport,
  getPayByLocationReport,
  getSalaryHistoryReport,
  getTimeOffScheduleReport,
  getEmploymentStatusHistoryReport,
  type PayGroupRow,
} from "@/lib/reports/standard";
import { parseReportFilters, runCustomEmployeeReport } from "@/lib/reports/custom";
import { getReportViewer } from "@/lib/reports/viewer";
import { filterRowsByEmployeeScope, scopedEmployeeIds } from "@/lib/employee-scope";
import { isFullAdmin } from "@/lib/authz";
import { canSeeAllEmployees } from "@/lib/access-scopes";

function csvResponse(csvData: string, reportType: string) {
  return new NextResponse(csvData, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${reportType}-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const { session, viewer } = await getReportViewer();
  if (!session?.user || !viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get("type") || "employees";
  const isOrgAdmin =
    session.user.role === "full_admin" ||
    isFullAdmin(viewer.accessLevel) ||
    canSeeAllEmployees(viewer);

  try {
    if (reportType === "employees" || reportType === "custom") {
      const fields =
        searchParams.get("fields")?.split(",").filter(Boolean) || [
          "employeeNumber",
          "firstName",
          "lastName",
          "email",
          "jobTitle",
          "department",
          "location",
          "hireDate",
          "employmentStatus",
        ];
      const result = await runCustomEmployeeReport({
        fields,
        groupBy: searchParams.get("groupBy"),
        filters: parseReportFilters(searchParams),
        viewer,
      });
      const header = fields;
      let csvData = csvRow(header) + "\n";
      for (const row of result.rows) {
        if ("_group" in row) continue;
        csvData += csvRow(header.map((field) => row[field])) + "\n";
      }
      return csvResponse(csvData, reportType);
    }

    if (reportType === "headcount" || reportType === "turnover") {
      if (!isOrgAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (reportType === "headcount") {
        return csvResponse(headcountToCsv(await getHeadcountReport()), reportType);
      }
      return csvResponse(turnoverToCsv(await getTurnoverReport()), reportType);
    }

    if (
      reportType === "pay-by-title" ||
      reportType === "pay-by-department" ||
      reportType === "pay-by-location" ||
      reportType === "salary-history"
    ) {
      if (!viewer.canViewCompensation) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (reportType === "salary-history") {
        const allowed = await scopedEmployeeIds(viewer);
        const rows = filterRowsByEmployeeScope(
          await getSalaryHistoryReport({ canViewCompensation: true }),
          allowed
        );
        let csvData =
          csvRow([
            "Employee",
            "Job Title",
            "Pay Rate",
            "Currency",
            "Pay Type",
            "Effective Date",
            "Reason",
          ]) + "\n";
        for (const row of rows) {
          csvData +=
            csvRow([
              `${row.firstName} ${row.lastName}`,
              row.jobTitle,
              row.payRate,
              row.currency,
              row.payType,
              row.effectiveDate,
              row.changeReason,
            ]) + "\n";
        }
        return csvResponse(csvData, reportType);
      }
      const rows: PayGroupRow[] =
        reportType === "pay-by-title"
          ? await getPayByTitleReport({ canViewCompensation: true })
          : reportType === "pay-by-department"
            ? await getPayByDepartmentReport({ canViewCompensation: true })
            : await getPayByLocationReport({ canViewCompensation: true });
      let csvData = csvRow(["Group", "Count", "Avg Pay", "Min Pay", "Max Pay", "Currency", "Pay Type"]) + "\n";
      for (const row of rows) {
        csvData += csvRow([row.group, row.count, row.avgPay, row.minPay, row.maxPay, row.currency, row.payType]) + "\n";
      }
      return csvResponse(csvData, reportType);
    }

    if (reportType === "time-off-schedule") {
      const allowed = await scopedEmployeeIds(viewer);
      const year = new Date().getUTCFullYear();
      const rows = filterRowsByEmployeeScope(await getTimeOffScheduleReport(year), allowed);
      let csvData = csvRow(["Employee", "Policy", "Start", "End", "Days", "Status"]) + "\n";
      for (const row of rows) {
        csvData +=
          csvRow([
            `${row.firstName} ${row.lastName}`,
            row.policy,
            row.startDate,
            row.endDate,
            row.daysRequested,
            row.status,
          ]) + "\n";
      }
      return csvResponse(csvData, reportType);
    }

    if (reportType === "employment-status") {
      const allowed = await scopedEmployeeIds(viewer);
      const rows = filterRowsByEmployeeScope(
        await getEmploymentStatusHistoryReport({
          viewerId: viewer.employeeId,
          canViewSensitivePersonalInfo: Boolean(viewer.canViewSensitivePersonalInfo),
        }),
        allowed
      );
      let csvData =
        csvRow(["Employee", "Status", "Effective Date", "Comment", "Department", "Location"]) +
        "\n";
      for (const row of rows) {
        csvData +=
          csvRow([
            `${row.firstName} ${row.lastName}`,
            row.employmentStatus,
            row.effectiveDate,
            row.comment,
            row.department,
            row.location,
          ]) + "\n";
      }
      return csvResponse(csvData, reportType);
    }

    return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  } catch (error: any) {
    console.error("Export failed:", error);
    return NextResponse.json(
      { error: "Export failed", message: error.message },
      { status: 500 }
    );
  }
}
