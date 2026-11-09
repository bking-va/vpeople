import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, departments, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getHeadcountReport, headcountToCsv } from "@/lib/reports/headcount";
import { getTurnoverReport } from "@/lib/reports/turnover";
import { turnoverToCsv } from "@/lib/reports/turnover-format";
import { csvRow } from "@/lib/csv";
import { getUserPermissions } from "@/lib/permissions";
import {
  getPayByTitleReport,
  getPayByDepartmentReport,
  getPayByLocationReport,
  getSalaryHistoryReport,
  getTimeOffScheduleReport,
  getEmploymentStatusHistoryReport,
  type PayGroupRow,
} from "@/lib/reports/standard";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.role !== "full_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get("type") || "employees";

  try {
    let csvData = "";

    if (reportType === "employees") {
      const data = await db
        .select({
          employeeNumber: employees.employeeNumber,
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
          jobTitle: employees.jobTitle,
          department: departments.name,
          location: locations.name,
          hireDate: employees.hireDate,
          employmentStatus: employees.employmentStatus,
        })
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .leftJoin(locations, eq(employees.locationId, locations.id));

      // CSV header
      csvData =
        csvRow([
          "Employee Number",
          "First Name",
          "Last Name",
          "Email",
          "Job Title",
          "Department",
          "Location",
          "Hire Date",
          "Status",
        ]) + "\n";

      for (const row of data) {
        csvData +=
          csvRow([
            row.employeeNumber,
            row.firstName,
            row.lastName,
            row.email,
            row.jobTitle,
            row.department || "",
            row.location || "",
            row.hireDate || "",
            row.employmentStatus,
          ]) + "\n";
      }
    } else if (reportType === "headcount") {
      const report = await getHeadcountReport();
      csvData = headcountToCsv(report);
    } else if (reportType === "turnover") {
      const report = await getTurnoverReport();
      csvData = turnoverToCsv(report);
    } else if (
      reportType === "pay-by-title" ||
      reportType === "pay-by-department" ||
      reportType === "pay-by-location" ||
      reportType === "salary-history"
    ) {
      const permissions = session.user.email
        ? await getUserPermissions(session.user.email)
        : null;
      const canViewPay = Boolean(permissions?.canViewCompensation);
      if (!canViewPay) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (reportType === "salary-history") {
        const rows = await getSalaryHistoryReport({ canViewCompensation: canViewPay });
        csvData =
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
      } else {
        const rows: PayGroupRow[] =
          reportType === "pay-by-title"
            ? await getPayByTitleReport({ canViewCompensation: canViewPay })
            : reportType === "pay-by-department"
              ? await getPayByDepartmentReport({ canViewCompensation: canViewPay })
              : await getPayByLocationReport({ canViewCompensation: canViewPay });
        csvData = csvRow(["Group", "Count", "Avg Pay", "Min Pay", "Max Pay", "Currency", "Pay Type"]) + "\n";
        for (const row of rows) {
          csvData += csvRow([row.group, row.count, row.avgPay, row.minPay, row.maxPay, row.currency, row.payType]) + "\n";
        }
      }
    } else if (reportType === "time-off-schedule") {
      const year = new Date().getUTCFullYear();
      const rows = await getTimeOffScheduleReport(year);
      csvData =
        csvRow(["Employee", "Policy", "Start", "End", "Days", "Status"]) + "\n";
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
    } else if (reportType === "employment-status") {
      const rows = await getEmploymentStatusHistoryReport();
      csvData =
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
    }

    return new NextResponse(csvData, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${reportType}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("Export failed:", error);
    return NextResponse.json(
      { error: "Export failed", message: error.message },
      { status: 500 }
    );
  }
}
