"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, jobHistory, compensationHistory, approvalWorkflows } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";
import { createApprovalRequest } from "@/lib/approvals";

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

  if (!session?.user?.employeeId) {
    return { success: false, error: "Unauthorized" };
  }

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);

  if (!currentEmployee) {
    return { success: false, error: "Employee record not found" };
  }
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
    employeeId: session.user.employeeId,
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

  if (!session?.user?.employeeId) {
    return { success: false, error: "Unauthorized" };
  }

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);

  if (!currentEmployee) {
    return { success: false, error: "Employee record not found" };
  }
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

  // Check if significant job change requires approval
  const hasSignificantChange =
    data.jobTitle ||
    data.departmentId ||
    data.locationId ||
    data.managerId ||
    data.employmentStatus;

  if (hasSignificantChange) {
    // Check if job info change approval workflow is enabled
    const [jobWorkflow] = await db
      .select()
      .from(approvalWorkflows)
      .where(
        and(
          eq(approvalWorkflows.type, "job_info_change"),
          eq(approvalWorkflows.enabled, true)
        )
      )
      .limit(1);

    if (jobWorkflow) {
      // Route through approval workflow
      const effectiveDate = new Date().toISOString().split("T")[0];
      
      const approvalResult = await createApprovalRequest({
        workflowId: jobWorkflow.id,
        entityType: "job_info_change",
        entityId: employeeId,
        requesterId: currentEmployee.id,
        metadata: {
          employeeId,
          effectiveDate,
          jobTitle: data.jobTitle || existingEmployee.jobTitle,
          jobFamilyId: data.jobFamilyId || existingEmployee.jobFamilyId,
          jobLevelId: data.jobLevelId || existingEmployee.jobLevelId,
          departmentId: data.departmentId || existingEmployee.departmentId,
          divisionId: data.divisionId || existingEmployee.divisionId || null,
          locationId: data.locationId || existingEmployee.locationId,
          managerId: data.managerId || existingEmployee.managerId || null,
          changeReason: "Job info update",
          // Store employee table updates separately
          employeeUpdates: data,
        },
      });

      if (!approvalResult.success) {
        return { success: false, error: "Failed to create approval request" };
      }

      await createAuditLog({
        employeeId: session.user.employeeId,
        action: "job_info_change_requested",
        entityType: "employee",
        entityId: employeeId.toString(),
        changes: {
          employeeId,
          before: existingEmployee,
          after: data,
          approvalRequestId: approvalResult.requestId,
        },
      });

      revalidatePath(`/people/${employeeId}`);
      revalidatePath("/approvals");

      return { 
        success: true, 
        requiresApproval: true,
        approvalRequestId: approvalResult.requestId,
      };
    }
  }

  // No workflow: apply immediately
  await db
    .update(employees)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, employeeId));

  if (hasSignificantChange) {
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
    employeeId: session.user.employeeId,
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

  if (!session?.user?.employeeId) {
    return { success: false, error: "Unauthorized" };
  }

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);

  if (!currentEmployee) {
    return { success: false, error: "Employee record not found" };
  }
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

  // Check if compensation change approval workflow is enabled
  const [compWorkflow] = await db
    .select()
    .from(approvalWorkflows)
    .where(
      and(
        eq(approvalWorkflows.type, "compensation_change"),
        eq(approvalWorkflows.enabled, true)
      )
    )
    .limit(1);

  if (compWorkflow) {
    // Route through approval workflow
    const approvalResult = await createApprovalRequest({
      workflowId: compWorkflow.id,
      entityType: "compensation_change",
      entityId: employeeId,
      requesterId: currentEmployee.id,
      metadata: {
        employeeId,
        payRate: data.payRate,
        payType: data.payType,
        paySchedule: data.paySchedule,
        currency: data.currency || "CAD",
        effectiveDate: data.effectiveDate,
        changeReason: data.changeReason,
      },
    });

    if (!approvalResult.success) {
      return { success: false, error: "Failed to create approval request" };
    }

    await createAuditLog({
      employeeId: session.user.employeeId,
      action: "compensation_change_requested",
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
        approvalRequestId: approvalResult.requestId,
      },
    });

    revalidatePath(`/people/${employeeId}`);
    revalidatePath("/approvals");

    return { 
      success: true, 
      requiresApproval: true,
      approvalRequestId: approvalResult.requestId,
    };
  }

  // No workflow: apply immediately
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
    employeeId: session.user.employeeId,
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
