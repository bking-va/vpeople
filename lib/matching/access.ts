import { canManageHiring, isFullAdmin, type AccessLevel } from "@/lib/authz";
import { hiringAccessForEmail } from "@/lib/hiring-access";
import { scopedEmployeeIds, type EmployeeScopeViewer } from "@/lib/employee-scope";
import { getUserPermissions } from "@/lib/permissions";
import { db } from "@/lib/db";
import { employeeAccessScopes, employees, jobOpenings, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { employeeMatchesAccessScope } from "@/lib/access-scopes";

export type MatchingActor = {
  employeeId: number;
  email: string;
  accessLevel: AccessLevel;
  canManageUsers: boolean;
  canManageAllHiring: boolean;
  allowed: boolean;
};

export async function matchingActorForEmail(email: string): Promise<MatchingActor | null> {
  const access = await hiringAccessForEmail(email);
  if (!access.employee) return null;
  const canManageUsers = access.permissions?.canManageUsers === true;
  const canManageAllHiring =
    canManageHiring({
      accessLevel: access.employee.accessLevel as AccessLevel,
      canManageUsers,
      isHiringLead: false,
    }) &&
    (canManageUsers || isFullAdmin(access.employee.accessLevel));
  return {
    employeeId: access.employee.id,
    email,
    accessLevel: access.employee.accessLevel as AccessLevel,
    canManageUsers,
    canManageAllHiring,
    allowed: access.allowed,
  };
}

export async function assertCanMatchJob(email: string, jobOpeningId?: number | null) {
  const actor = await matchingActorForEmail(email);
  if (!actor) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized", actor: null };
  }
  if (jobOpeningId) {
    const access = await hiringAccessForEmail(email, jobOpeningId);
    if (!access.allowed) {
      return { ok: false as const, status: 403 as const, error: "Forbidden", actor };
    }
    return { ok: true as const, actor, access };
  }
  if (!actor.allowed) {
    return { ok: false as const, status: 403 as const, error: "Forbidden", actor };
  }
  return { ok: true as const, actor, access: null };
}

export async function employeeIdsVisibleToMatcher(
  actor: MatchingActor
): Promise<Set<number> | "all"> {
  const viewer: EmployeeScopeViewer = {
    employeeId: actor.employeeId,
    accessLevel: actor.accessLevel,
    canManageUsers: actor.canManageUsers,
  };
  return scopedEmployeeIds(viewer);
}

export async function applicantJobIdsVisibleToMatcher(
  actor: MatchingActor
): Promise<Set<number> | "all"> {
  if (actor.canManageAllHiring) return "all";
  const openings = await db
    .select({
      id: jobOpenings.id,
      hiringLeadId: jobOpenings.hiringLeadId,
      locationId: jobOpenings.locationId,
      country: locations.country,
    })
    .from(jobOpenings)
    .leftJoin(locations, eq(jobOpenings.locationId, locations.id));

  if (actor.accessLevel === "regional_view") {
    const scopes = await db
      .select({
        locationId: employeeAccessScopes.locationId,
        country: employeeAccessScopes.country,
      })
      .from(employeeAccessScopes)
      .where(eq(employeeAccessScopes.employeeId, actor.employeeId));
    const allowed = new Set<number>();
    for (const opening of openings) {
      const lead = opening.hiringLeadId === actor.employeeId;
      const inRegion = employeeMatchesAccessScope(
        { locationId: opening.locationId, country: opening.country },
        scopes
      );
      if (lead || inRegion) allowed.add(opening.id);
    }
    return allowed;
  }

  const asLead = new Set<number>();
  for (const opening of openings) {
    if (opening.hiringLeadId === actor.employeeId) asLead.add(opening.id);
  }
  return asLead;
}

export async function canEditCustomerLocations(email: string): Promise<boolean> {
  const [employee] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.email, email))
    .limit(1);
  if (!employee) return false;
  const permissions = await getUserPermissions(email);
  return isFullAdmin(employee.accessLevel) || permissions.canManageUsers === true;
}
