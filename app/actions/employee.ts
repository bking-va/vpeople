"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, jobHistory, compensationHistory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";

export async function updateEmployeeProfile(
  employeeId: number,
  data: {
    firstName?: string;
    lastName?: string;
    workPhone?: string;
    extension?: string;
    birthDate?: string;
    gender?: "male" | "female" | "prefer_not_to_say";
  }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const currentUserEmployee = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!currentUserEmployee.length) {
    return { success: false, error: "Employee record not found" };
  }

  const currentEmployee = currentUserEmployee[0];
  const isAdmin = currentEmployee.accessLevel === "full_admin";
  const isSelf = currentEmployee.id === employeeId;

  if (!isAdmin && !isSelf) {
    return {
      success: false,
      error: "You do not have permission to update this profile",
    };
  }

  const [existingEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!existingEmployee) {
    return { success: false, error: "Employee not found" };
  }

  await db
    .update(employees)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, employeeId));

  await createAuditLog({
    userId: session.user.id,
    action: "employee_updated",
    entityType: "employee",
    entityId: employeeId.toString(),
    changes: {
      employeeId,
      before: existingEmployee,
      after: data,
    },
  });

  revalidatePath(`/people/${employeeId}`);

  return { success: true };
}

export async function updateEmployeeJobInfo(
  employeeId: number,
  data: {
    jobTitle?: string;
    departmentId?: number;
    divisionId?: number;
    locationId?: number;
    managerId?: number;
    employmentStatus?: "full_time" | "part_time" | "contractor" | "on_leave" | "terminated";
    jobFamilyId?: number;
    jobLevelId?: number;
  }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const currentUserEmployee = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!currentUserEmployee.length) {
    return { success: false, error: "Employee record not found" };
  }

  const currentEmployee = currentUserEmployee[0];
  const isAdmin = currentEmployee.accessLevel === "full_admin";

  if (!isAdmin) {
    return {
      success: false,
      error: "Only administrators can update job information",
    };
  }

  const [existingEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!existingEmployee) {
    return { success: false, error: "Employee not found" };
  }

  await db
    .update(employees)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, employeeId));

  if (
    data.jobTitle ||
    data.departmentId ||
    data.locationId ||
    data.managerId ||
    data.employmentStatus
  ) {
    await db.insert(jobHistory).values({
      employeeId,
      effectiveDate: new Date().toISOString().split("T")[0],
      jobTitle: data.jobTitle || existingEmployee.jobTitle,
      departmentId: data.departmentId || existingEmployee.departmentId,
      divisionId: data.divisionId || existingEmployee.divisionId || null,
      locationId: data.locationId || existingEmployee.locationId,
      managerId: data.managerId || existingEmployee.managerId || null,
      employmentStatus: data.employmentStatus || existingEmployee.employmentStatus,
    });
  }

  await createAuditLog({
    userId: session.user.id,
    action: "job_info_updated",
    entityType: "employee",
    entityId: employeeId.toString(),
    changes: {
      employeeId,
      before: existingEmployee,
      after: data,
    },
  });

  revalidatePath(`/people/${employeeId}`);

  return { success: true };
}

export async function updateEmployeeCompensation(
  employeeId: number,
  data: {
    payRate?: string;
    payType?: string;
    paySchedule?: string;
    currency?: string;
    effectiveDate: string;
    changeReason?: string;
  }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const currentUserEmployee = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!currentUserEmployee.length) {
    return { success: false, error: "Employee record not found" };
  }

  const currentEmployee = currentUserEmployee[0];
  const isAdmin = currentEmployee.accessLevel === "full_admin";

  if (!isAdmin) {
    return {
      success: false,
      error: "Only administrators can update compensation",
    };
  }

  const [existingEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!existingEmployee) {
    return { success: false, error: "Employee not found" };
  }

  await db.insert(compensationHistory).values({
    employeeId,
    effectiveDate: data.effectiveDate,
    payRate: data.payRate || "0",
    payType: data.payType,
    paySchedule: data.paySchedule,
    currency: data.currency || "CAD",
    changeReason: data.changeReason,
  });

  await createAuditLog({
    userId: session.user.id,
    action: "compensation_updated",
    entityType: "employee",
    entityId: employeeId.toString(),
    changes: {
      employeeId,
      payRate: data.payRate,
      payType: data.payType,
      paySchedule: data.paySchedule,
      currency: data.currency,
      effectiveDate: data.effectiveDate,
      changeReason: data.changeReason,
    },
  });

  revalidatePath(`/people/${employeeId}`);

  return { success: true };
}
