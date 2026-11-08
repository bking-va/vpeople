import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, employeeTasks, taskTemplates, auditLogs } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Verify the user has permission
    const employeeId = session.user.employeeId;
    if (!employeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [currentEmployee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const data = await request.json();

    // Generate employee number
    const lastEmployee = await db
      .select({ employeeNumber: employees.employeeNumber })
      .from(employees)
      .orderBy(sql`${employees.employeeNumber} DESC NULLS LAST`)
      .limit(1);

    let nextNumber = "E001";
    if (lastEmployee.length > 0 && lastEmployee[0].employeeNumber) {
      const lastNumber = parseInt(lastEmployee[0].employeeNumber.replace("E", ""), 10);
      nextNumber = `E${String(lastNumber + 1).padStart(3, "0")}`;
    }

    // Create employee
    const [newEmployee] = await db
      .insert(employees)
      .values({
        employeeNumber: nextNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        hireDate: data.hireDate,
        employmentStatus: data.employmentStatus || "full_time",
        jobTitle: data.jobTitle,
        departmentId: data.departmentId ? parseInt(data.departmentId, 10) : null,
        divisionId: data.divisionId ? parseInt(data.divisionId, 10) : null,
        locationId: data.locationId ? parseInt(data.locationId, 10) : null,
        jobFamilyId: data.jobFamilyId ? parseInt(data.jobFamilyId, 10) : null,
        jobLevelId: data.jobLevelId ? parseInt(data.jobLevelId, 10) : null,
        managerId: data.managerId ? parseInt(data.managerId, 10) : null,
        accessLevel: data.accessLevel || "employee",
        workPhone: data.workPhone || null,
      })
      .returning();

    // Create onboarding tasks from templates
    const templates = await db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.taskType, "onboarding"));

    if (templates.length > 0) {
      const hireDate = new Date(data.hireDate);
      const tasksToCreate = templates.map((template) => {
        let dueDate: Date | undefined;
        if (template.dueDaysFromStart) {
          dueDate = new Date(hireDate);
          dueDate.setDate(dueDate.getDate() + template.dueDaysFromStart);
        }

        return {
          employeeId: newEmployee.id,
          templateId: template.id,
          taskType: "onboarding",
          title: template.name,
          description: template.description,
          assignedToId: template.assignedToRole === "manager" && newEmployee.managerId
            ? newEmployee.managerId
            : currentEmployee.id,
          dueDate: dueDate ? dueDate.toISOString().split("T")[0] : null,
          status: "pending" as const,
        };
      });

      await db.insert(employeeTasks).values(tasksToCreate);
    }

    // Audit log
    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: "employee_created",
      entityType: "employee",
      entityId: String(newEmployee.id),
      changes: {
        employeeNumber: nextNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        hireDate: data.hireDate,
        jobTitle: data.jobTitle,
      },
    });

    return NextResponse.json({ employee: newEmployee });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to create employee:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create employee", message: errorMessage },
      { status: 500 }
    );
  }
}
