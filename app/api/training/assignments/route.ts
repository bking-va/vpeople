import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { trainingCompletions, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db
    .select({ accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (!employee || (employee.accessLevel !== "full_admin" && employee.accessLevel !== "manager")) {
    return NextResponse.json(
      { error: "Admin or manager access required" },
      { status: 403 }
    );
  }

  try {
    const data = await request.json();

    let targetEmployees: number[] = [];

    if (data.type === "individual") {
      targetEmployees = data.employeeIds;
    } else if (data.type === "department") {
      const deptEmployees = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.departmentId, data.departmentId));

      targetEmployees = deptEmployees.map((e) => e.id);
    }

    // Create pending training completion records
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
