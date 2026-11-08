import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, departments, locations, jobLevels } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all active employees with their reporting structure
    const orgData = await db
      .select({
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        jobTitle: employees.jobTitle,
        department: departments.name,
        location: locations.name,
        level: jobLevels.name,
        hireDate: employees.hireDate,
        managerId: employees.managerId,
        managerFirstName: sql<string>`mgr.first_name`,
        managerLastName: sql<string>`mgr.last_name`,
      })
      .from(employees)
      .leftJoin(departments, sql`${employees.departmentId} = ${departments.id}`)
      .leftJoin(locations, sql`${employees.locationId} = ${locations.id}`)
      .leftJoin(jobLevels, sql`${employees.jobLevelId} = ${jobLevels.id}`)
      .leftJoin(
        sql`${employees} as mgr`,
        sql`${employees.managerId} = mgr.id`
      )
      .where(sql`${employees.employmentStatus} != 'terminated'`)
      .orderBy(employees.lastName, employees.firstName);

    // Generate CSV
    const headers = [
      "Employee Number",
      "First Name",
      "Last Name",
      "Email",
      "Job Title",
      "Department",
      "Location",
      "Level",
      "Hire Date",
      "Manager",
    ];

    const rows = orgData.map((emp) => {
      const managerName =
        emp.managerFirstName && emp.managerLastName
          ? `${emp.managerFirstName} ${emp.managerLastName}`
          : "";

      return [
        emp.employeeNumber || "",
        emp.firstName,
        emp.lastName,
        emp.email,
        emp.jobTitle || "",
        emp.department || "",
        emp.location || "",
        emp.level || "",
        emp.hireDate || "",
        managerName,
      ].map((field) => `"${String(field).replace(/"/g, '""')}"`);
    });

    const csv = [
      headers.map((h) => `"${h}"`).join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="org-chart-export.csv"',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to export org chart:", errorMessage);
    return NextResponse.json(
      { error: "Failed to export org chart", message: errorMessage },
      { status: 500 }
    );
  }
}
