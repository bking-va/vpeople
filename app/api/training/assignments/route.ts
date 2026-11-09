import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { trainingCompletions, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isFullAdmin, isManagerAccessLevel, isViewingAccessLevel } from "@/lib/authz";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (
    !employee ||
    isViewingAccessLevel(employee.accessLevel) ||
    (!isFullAdmin(employee.accessLevel) && !isManagerAccessLevel(employee.accessLevel))
  ) {
    return NextResponse.json(
      { error: "Admin or manager access required" },
      { status: 403 }
    );
  }

  try {
    const data = await request.json();

    let targetEmployees: number[] = [];

    if (data.type === "individual") {
      targetEmployees = data.employeeIds || [];
    } else if (data.type === "department") {
      if (!isFullAdmin(employee.accessLevel)) {
        return NextResponse.json(
          { error: "Only full admins can assign training to a whole department" },
          { status: 403 }
        );
      }
      const deptEmployees = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.departmentId, data.departmentId));

      targetEmployees = deptEmployees.map((e) => e.id);
    }

    if (isManagerAccessLevel(employee.accessLevel)) {
      const reports = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.managerId, employee.id));
      const reportIds = new Set(reports.map((r) => r.id));
      if (targetEmployees.some((id) => !reportIds.has(id))) {
        return NextResponse.json(
          { error: "Managers can only assign training to their direct reports" },
          { status: 403 }
        );
      }
    }

    const assignments = targetEmployees.map((empId) => ({
      courseId: data.courseId,
      employeeId: empId,
      status: "pending" as const,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    }));

    if (assignments.length > 0) {
      await db.insert(trainingCompletions).values(assignments);
    }

    return NextResponse.json({
      success: true,
      assigned: assignments.length,
    });
  } catch (error: any) {
    console.error("Failed to assign training:", error);
    return NextResponse.json(
      { error: "Failed to assign training", message: error.message },
      { status: 500 }
    );
  }
}
