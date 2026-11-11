import { db } from "@/lib/db";
import { employees, employeeAccessScopes, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  isManagerAccessLevel,
  type AccessLevel,
  visibleProfileEmail,
} from "@/lib/authz";
import {
  canSeeAllEmployees,
  employeeMatchesAccessScope,
} from "@/lib/access-scopes";
import { getUserPermissions } from "@/lib/permissions";

export { canSeeAllEmployees } from "@/lib/access-scopes";

export type EmployeeScopeViewer = {
  employeeId: number;
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
  canViewCompensation?: boolean;
  canViewSensitivePersonalInfo?: boolean;
};

/** Same visibility as profiles: HR/admin/global_view see everyone; regional_view uses allowlists; managers see self + reports; others see self. */
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
  if (viewer.accessLevel === "regional_view") {
    const scopes = await db
      .select({
        locationId: employeeAccessScopes.locationId,
        country: employeeAccessScopes.country,
      })
      .from(employeeAccessScopes)
      .where(eq(employeeAccessScopes.employeeId, viewer.employeeId));
    if (scopes.length > 0) {
      const directory = await db
        .select({
          id: employees.id,
          locationId: employees.locationId,
          country: locations.country,
        })
        .from(employees)
        .leftJoin(locations, eq(employees.locationId, locations.id));
      for (const row of directory) {
        if (
          employeeMatchesAccessScope(
            { locationId: row.locationId, country: row.country },
            scopes
          )
        ) {
          allowed.add(row.id);
        }
      }
    }
  }
  return allowed;
}

export async function scopedEmployeeIdsForEmployee(
  employeeId: number
): Promise<Set<number> | "all"> {
  const [employee] = await db
    .select({
      id: employees.id,
      accessLevel: employees.accessLevel,
      email: employees.email,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) return new Set();
  const permissions = await getUserPermissions(employee.email);
  return scopedEmployeeIds({
    employeeId: employee.id,
    accessLevel: employee.accessLevel,
    canManageUsers: permissions.canManageUsers,
    canViewCompensation: permissions.canViewCompensation,
    canViewSensitivePersonalInfo: permissions.canViewSensitivePersonalInfo,
  });
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
