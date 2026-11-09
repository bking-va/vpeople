import { db } from "@/lib/db";
import {
  employees,
  employeeTasks,
  taskTemplates,
  terminationReasons,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/audit";
import { recordEmploymentStatusChange, type EmploymentStatus } from "@/lib/employment-status";
import { isCanadianRoeCode } from "@/lib/roe";

type LifecycleExecutor = Pick<typeof db, "insert" | "update" | "select">;

export async function terminateEmployee(
  opts: {
    employeeId: number;
    actorId: number;
    terminationDate: string;
    terminationType?: string | null;
    terminationReasonId?: number | null;
    notes?: string | null;
  },
  executor: LifecycleExecutor = db
) {
  const [employee] = await executor
    .select()
    .from(employees)
    .where(eq(employees.id, opts.employeeId))
    .limit(1);

  if (!employee) {
    return { ok: false as const, error: "Employee not found", status: 404 };
  }
  if (employee.employmentStatus === "terminated") {
    return { ok: false as const, error: "Employee already terminated", status: 400 };
  }

  let roeCode: string | null = null;
  let reasonName: string | null = null;
  if (opts.terminationReasonId) {
    const [reason] = await executor
      .select()
      .from(terminationReasons)
      .where(eq(terminationReasons.id, opts.terminationReasonId))
      .limit(1);
    if (!reason || !reason.isActive) {
      return { ok: false as const, error: "Invalid termination reason", status: 400 };
    }
    roeCode = isCanadianRoeCode(reason.roeCode) ? reason.roeCode : reason.roeCode;
    reasonName = reason.name;
  }

  const [updatedEmployee] = await executor
    .update(employees)
    .set({
      employmentStatus: "terminated",
      terminationDate: opts.terminationDate,
      terminationType: opts.terminationType || null,
      terminationReasonId: opts.terminationReasonId || null,
      roeCode,
      originalHireDate: employee.originalHireDate || employee.hireDate,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, opts.employeeId))
    .returning();

  await recordEmploymentStatusChange(
    {
      employeeId: opts.employeeId,
      status: "terminated",
      effectiveDate: opts.terminationDate,
      comment: reasonName || opts.terminationType || "Termination",
      changeType: "terminate",
      terminationReasonId: opts.terminationReasonId || null,
      recordedById: opts.actorId,
    },
    executor
  );

  const templates = await executor
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.taskType, "offboarding"));

  if (templates.length > 0) {
    const termDate = new Date(opts.terminationDate);
    const tasksToCreate = templates.map((template) => {
      let dueDate: string | null = null;
      if (template.dueDaysFromStart) {
        const due = new Date(termDate);
        due.setDate(due.getDate() + template.dueDaysFromStart);
        dueDate = due.toISOString().split("T")[0];
      }
      return {
        employeeId: opts.employeeId,
        templateId: template.id,
        taskType: "offboarding",
        title: template.name,
        description: template.description,
        assignedToId:
          template.assignedToRole === "manager" && employee.managerId
            ? employee.managerId
            : opts.actorId,
        dueDate,
        status: "pending" as const,
      };
    });
    await executor.insert(employeeTasks).values(tasksToCreate);
  }

  await createAuditLog({
    employeeId: opts.actorId,
    action: "employee_terminated",
    entityType: "employee",
    entityId: String(opts.employeeId),
    changes: {
      terminationDate: opts.terminationDate,
      terminationType: opts.terminationType,
      terminationReasonId: opts.terminationReasonId,
      terminationReason: reasonName,
      roeCode,
      notes: opts.notes,
      previousStatus: employee.employmentStatus,
      newStatus: "terminated",
    },
  });

  return {
    ok: true as const,
    employee: updatedEmployee,
    roeCode,
    reasonName,
  };
}

export async function rehireEmployee(
  opts: {
    employeeId: number;
    actorId: number;
    hireDate: string;
    employmentStatus?: EmploymentStatus;
    jobTitle?: string | null;
    notes?: string | null;
  },
  executor: LifecycleExecutor = db
) {
  const [employee] = await executor
    .select()
    .from(employees)
    .where(eq(employees.id, opts.employeeId))
    .limit(1);

  if (!employee) {
    return { ok: false as const, error: "Employee not found", status: 404 };
  }
  if (employee.employmentStatus !== "terminated") {
    return { ok: false as const, error: "Only terminated employees can be rehired", status: 400 };
  }

  const nextStatus = opts.employmentStatus && opts.employmentStatus !== "terminated"
    ? opts.employmentStatus
    : "full_time";
  const originalHireDate = employee.originalHireDate || employee.hireDate;

  const [updatedEmployee] = await executor
    .update(employees)
    .set({
      hireDate: opts.hireDate,
      originalHireDate,
      employmentStatus: nextStatus,
      terminationDate: null,
      terminationReasonId: null,
      terminationType: null,
      roeCode: null,
      jobTitle: opts.jobTitle ?? employee.jobTitle,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, opts.employeeId))
    .returning();

  await recordEmploymentStatusChange(
    {
      employeeId: opts.employeeId,
      status: nextStatus,
      effectiveDate: opts.hireDate,
      comment: opts.notes || "Rehire",
      changeType: "rehire",
      recordedById: opts.actorId,
    },
    executor
  );

  await createAuditLog({
    employeeId: opts.actorId,
    action: "employee_rehired",
    entityType: "employee",
    entityId: String(opts.employeeId),
    changes: {
      hireDate: opts.hireDate,
      originalHireDate,
      previousHireDate: employee.hireDate,
      previousTerminationDate: employee.terminationDate,
      previousStatus: employee.employmentStatus,
      newStatus: nextStatus,
      notes: opts.notes,
    },
  });

  return { ok: true as const, employee: updatedEmployee };
}

export function publicEmployeeDto(employee: {
  id: number;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  email: string;
  employmentStatus: string;
  hireDate: string | null;
  originalHireDate?: string | null;
  terminationDate: string | null;
  jobTitle?: string | null;
}) {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    employmentStatus: employee.employmentStatus,
    hireDate: employee.hireDate,
    originalHireDate: employee.originalHireDate ?? null,
    terminationDate: employee.terminationDate,
    jobTitle: employee.jobTitle ?? null,
  };
}
