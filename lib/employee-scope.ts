import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  isFullAdmin,
  isManagerAccessLevel,
  isViewingAccessLevel,
  type AccessLevel,
  visibleProfileEmail,
} from "@/lib/authz";

export type EmployeeScopeViewer = {
  employeeId: number;
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
  canViewCompensation?: boolean;
  canViewSensitivePersonalInfo?: boolean;
};

export function canSeeAllEmployees(viewer: EmployeeScopeViewer): boolean {
  return (
    isFullAdmin(viewer.accessLevel) ||
    viewer.canManageUsers === true ||
    isViewingAccessLevel(viewer.accessLevel)
  );
}

/** Same visibility as profiles: HR/admin/viewing roles see everyone; managers see self + reports; others see self. */
export async function scopedEmployeeIds(
  viewer: EmployeeScopeViewer
): Promise<Set<number> | "all"> {
  if (canSeeAllEmployees(viewer)) return "all";

  const allowed = new Set<number>([viewer.employeeId]);
  if (isManagerAccessLevel(viewer.accessLevel)) {
    const reports = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.managerId, viewer.employeeId));
    for (const report of reports) allowed.add(report.id);
  }
  return allowed;
}

export function employeeInScope(
  employeeId: number,
  allowed: Set<number> | "all"
): boolean {
  return allowed === "all" || allowed.has(employeeId);
}

export function filterRowsByEmployeeScope<T extends { employeeId?: number; id?: number }>(
  rows: T[],
  allowed: Set<number> | "all"
): T[] {
  if (allowed === "all") return rows;
  return rows.filter((row) => {
    const id = row.employeeId ?? row.id;
    return typeof id === "number" && allowed.has(id);
  });
}

export function redactReportEmail(
  email: string | null | undefined,
  opts: {
    employeeId: number;
    viewerId: number;
    canViewSensitivePersonalInfo: boolean;
  }
): string | null {
  return visibleProfileEmail(email, {
    isViewingSelf: opts.employeeId === opts.viewerId,
    canViewSensitivePersonalInfo: opts.canViewSensitivePersonalInfo,
  });
}
