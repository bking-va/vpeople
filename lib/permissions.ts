import { db } from "@/lib/db";
import { employees, accessLevels } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const EMPTY_USER_PERMISSIONS = {
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

function mapPermissions(row: { permissions: typeof accessLevels.$inferSelect | null }) {
  if (!row.permissions) return EMPTY_USER_PERMISSIONS;
  return {
    canViewCompensation: row.permissions.canViewCompensation,
    canEditCompensation: row.permissions.canEditCompensation,
    canViewSensitivePersonalInfo: row.permissions.canViewSensitivePersonalInfo,
    canEditSensitivePersonalInfo: row.permissions.canEditSensitivePersonalInfo,
    canViewBankInfo: row.permissions.canViewBankInfo,
    canEditBankInfo: row.permissions.canEditBankInfo,
    canManageUsers: row.permissions.canManageUsers,
    canManageSettings: row.permissions.canManageSettings,
    canApproveTimeOff: row.permissions.canApproveTimeOff,
    canApproveCompensationChanges: row.permissions.canApproveCompensationChanges,
  };
}

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

  if (!employee) return EMPTY_USER_PERMISSIONS;
  return mapPermissions(employee);
}

/** Session permissions follow bound employeeId, never an unbound email. */
export async function getUserPermissionsByEmployeeId(
  employeeId: number | null | undefined
) {
  if (employeeId == null) return EMPTY_USER_PERMISSIONS;
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
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) return EMPTY_USER_PERMISSIONS;
  return mapPermissions(employee);
}

export async function getSessionUserPermissions(session: {
  user?: { employeeId?: number | null };
} | null) {
  return getUserPermissionsByEmployeeId(session?.user?.employeeId);
}

type WorkflowType =
  | "time_off"
  | "compensation_change"
  | "employment_status_change"
  | "job_info_change"
  | "information_update"
  | "promotion";

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
