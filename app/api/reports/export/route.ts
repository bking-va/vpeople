import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, departments, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      csvData = "Employee Number,First Name,Last Name,Email,Job Title,Department,Location,Hire Date,Status\n";

      // CSV rows
      for (const row of data) {
        csvData += [
          row.employeeNumber,
          row.firstName,
          row.lastName,
          row.email,
          row.jobTitle,
          row.department || "",
          row.location || "",
          row.hireDate || "",
          row.employmentStatus,
        ]
          .map((val) => `"${String(val).replace(/"/g, '""')}"`)
          .join(",") + "\n";
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
