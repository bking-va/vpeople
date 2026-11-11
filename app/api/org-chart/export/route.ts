import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, departments, locations, jobLevels } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { csvRow } from "@/lib/csv";
import { visibleDirectoryEmail } from "@/lib/authz";
import { getUserPermissions } from "@/lib/permissions";
import { employeeInScope, scopedEmployeeIds } from "@/lib/employee-scope";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!session.user.employeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [actor] = await db
      .select({ id: employees.id, accessLevel: employees.accessLevel })
      .from(employees)
      .where(sql`${employees.id} = ${session.user.employeeId}`)
      .limit(1);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const permissions = session.user.email
      ? await getUserPermissions(session.user.email)
      : null;
    const allowed = await scopedEmployeeIds({
      employeeId: actor.id,
      accessLevel: actor.accessLevel,
      canManageUsers: Boolean(permissions?.canManageUsers),
    });

    // Fetch all active employees with their reporting structure
    const orgData = await db
      .select({
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        id: employees.id,
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

    const rows = orgData.filter((emp) => employeeInScope(emp.id, allowed)).map((emp) => {
      const managerName =
        emp.managerFirstName && emp.managerLastName
          ? `${emp.managerFirstName} ${emp.managerLastName}`
          : "";

      return csvRow([
        emp.employeeNumber || "",
        emp.firstName,
        emp.lastName,
        visibleDirectoryEmail(emp.email, { isSelf: emp.id === session.user.employeeId }),
        emp.jobTitle || "",
        emp.department || "",
        emp.location || "",
        emp.level || "",
        emp.hireDate || "",
        managerName,
      ]);
    });

    const csv = [csvRow(headers), ...rows].join("\n");

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
