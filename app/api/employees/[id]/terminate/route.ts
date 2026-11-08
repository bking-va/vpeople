import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, employeeTasks, taskTemplates, auditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const targetEmployeeId = parseInt(resolvedParams.id, 10);

    // Verify the user has permission
    const currentEmployeeId = session.user.employeeId;
    if (!currentEmployeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [currentEmployee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, currentEmployeeId))
      .limit(1);

    if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Fetch the employee to terminate
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, targetEmployeeId))
      .limit(1);

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    if (employee.employmentStatus === "terminated") {
      return NextResponse.json(
        { error: "Employee already terminated" },
        { status: 400 }
      );
    }

    const data = await request.json();
    const { terminationDate, terminationType, terminationReason, notes } = data;

    // Update employee status
    const [updatedEmployee] = await db
      .update(employees)
      .set({
        employmentStatus: "terminated",
        terminationDate,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, targetEmployeeId))
      .returning();

    // Create offboarding tasks from templates
    const templates = await db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.taskType, "offboarding"));

    if (templates.length > 0) {
      const termDate = new Date(terminationDate);
      const tasksToCreate = templates.map((template) => {
        let dueDate: Date | undefined;
        if (template.dueDaysFromStart) {
          // For offboarding, use dueDaysFromStart as days relative to termination
          dueDate = new Date(termDate);
          dueDate.setDate(dueDate.getDate() + template.dueDaysFromStart);
        }

        return {
          employeeId: targetEmployeeId,
          templateId: template.id,
          taskType: "offboarding",
          title: template.name,
          description: template.description,
          assignedToId: template.assignedToRole === "manager" && employee.managerId
            ? employee.managerId
            : currentEmployee.id,
          dueDate: dueDate ? dueDate.toISOString().split("T")[0] : null,
          status: "pending" as const,
        };
      });

      await db.insert(employeeTasks).values(tasksToCreate);
    }

    // Audit log
    await db.insert(auditLogs).values({
      employeeId: session.user.employeeId,
      action: "employee_terminated",
      entityType: "employee",
      entityId: String(targetEmployeeId),
      changes: {
        terminationDate,
        terminationType,
        terminationReason,
        notes,
        previousStatus: employee.employmentStatus,
        newStatus: "terminated",
      },
    });

    // Return minimal DTO without sensitive data
    return NextResponse.json({
      employee: {
        id: updatedEmployee.id,
        employeeNumber: updatedEmployee.employeeNumber,
        firstName: updatedEmployee.firstName,
        lastName: updatedEmployee.lastName,
        email: updatedEmployee.email,
        employmentStatus: updatedEmployee.employmentStatus,
        terminationDate: updatedEmployee.terminationDate,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to terminate employee:", errorMessage);
    return NextResponse.json(
      { error: "Failed to terminate employee", message: errorMessage },
      { status: 500 }
    );
  }
}
