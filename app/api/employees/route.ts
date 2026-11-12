import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { visibleDirectoryEmail } from "@/lib/authz";
import { getUserPermissions } from "@/lib/permissions";
import { employeeInScope, scopedEmployeeIds } from "@/lib/employee-scope";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!session.user.employeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [actor] = await db
      .select({
        id: employees.id,
        accessLevel: employees.accessLevel,
      })
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
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

    const emps = await db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        jobTitle: employees.jobTitle,
      })
      .from(employees)
      .where(eq(employees.employmentStatus, "full_time"));

    const viewerId = session.user.employeeId;
    return NextResponse.json({
      employees: emps
        .filter((emp) => employeeInScope(emp.id, allowed))
        .map((emp) => ({
          ...emp,
          email: visibleDirectoryEmail(emp.email, { isSelf: emp.id === viewerId }),
        })),
    });
  } catch (error: any) {
    console.error("Failed to fetch employees:", error);
    return NextResponse.json(
      { error: "Failed to fetch employees", message: error.message },
      { status: 500 }
    );
  }
}
