import { db } from "@/lib/db";
import { employees, accessLevels } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function getUserPermissions(email: string) {
  const [employee] = await db
    .select({
      id: employees.id,
      accessLevel: employees.accessLevel,
      permissions: accessLevels,
    })
    .from(employees)
    .leftJoin(
      accessLevels,
      sql`${employees.accessLevel}::text = ${accessLevels.code}`
    )
    .where(eq(employees.email, email))
    .limit(1);

  if (!employee || !employee.permissions) {
    return {
      canViewCompensation: false,
      canEditCompensation: false,
      canViewSensitivePersonalInfo: false,
      canEditSensitivePersonalInfo: false,
      canViewBankInfo: false,
      canEditBankInfo: false,
      canManageUsers: false,
      canManageSettings: false,
      canApproveTimeOff: false,
      canApproveCompensationChanges: false,
    };
  }

  return {
    canViewCompensation: employee.permissions.canViewCompensation,
    canEditCompensation: employee.permissions.canEditCompensation,
    canViewSensitivePersonalInfo: employee.permissions.canViewSensitivePersonalInfo,
    canEditSensitivePersonalInfo: employee.permissions.canEditSensitivePersonalInfo,
    canViewBankInfo: employee.permissions.canViewBankInfo,
    canEditBankInfo: employee.permissions.canEditBankInfo,
    canManageUsers: employee.permissions.canManageUsers,
    canManageSettings: employee.permissions.canManageSettings,
    canApproveTimeOff: employee.permissions.canApproveTimeOff,
    canApproveCompensationChanges: employee.permissions.canApproveCompensationChanges,
  };
}

type WorkflowType = "time_off" | "compensation_change" | "employment_status_change" | "job_info_change" | "information_update";

export async function getWorkflowConfig(type: WorkflowType) {
  const { approvalWorkflows } = await import("@/lib/db/schema");
  const { and } = await import("drizzle-orm");
  
  const [workflow] = await db
    .select()
    .from(approvalWorkflows)
    .where(and(
      eq(approvalWorkflows.type, type),
      eq(approvalWorkflows.enabled, true)
    ))
    .limit(1);

  return workflow || null;
}
