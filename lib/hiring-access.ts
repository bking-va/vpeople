import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  candidates,
  employeeAccessScopes,
  employees,
  jobOpenings,
  locations,
} from "@/lib/db/schema";
import { canManageHiring, canViewOfferSalary, type AccessLevel } from "@/lib/authz";
import { employeeMatchesAccessScope } from "@/lib/access-scopes";
import { getUserPermissions } from "@/lib/permissions";

export async function hiringAccessForEmail(
  email: string,
  jobOpeningId?: number | null
) {
  const [employee] = await db
    .select({
      id: employees.id,
      accessLevel: employees.accessLevel,
    })
    .from(employees)
    .where(eq(employees.email, email))
    .limit(1);

  if (!employee) {
    return {
      allowed: false,
      canViewSalary: false,
      employee: null,
      permissions: null,
      notFound: false,
    };
  }

  const permissions = await getUserPermissions(email);
  const accessLevel = employee.accessLevel as AccessLevel;
  const canManageAll =
    canManageHiring({
      accessLevel,
      canManageUsers: permissions.canManageUsers,
      isHiringLead: false,
    }) &&
    (permissions.canManageUsers === true || accessLevel === "full_admin");

  let isHiringLead = false;
  let jobLocationId: number | null = null;
  let jobCountry: string | null = null;
  if (jobOpeningId) {
    const [opening] = await db
      .select({
        hiringLeadId: jobOpenings.hiringLeadId,
        locationId: jobOpenings.locationId,
        country: locations.country,
      })
      .from(jobOpenings)
      .leftJoin(locations, eq(jobOpenings.locationId, locations.id))
      .where(eq(jobOpenings.id, jobOpeningId))
      .limit(1);
    isHiringLead = opening?.hiringLeadId === employee.id;
    jobLocationId = opening?.locationId ?? null;
    jobCountry = opening?.country ?? null;
  } else {
    const [lead] = await db
      .select({ id: jobOpenings.id })
      .from(jobOpenings)
      .where(eq(jobOpenings.hiringLeadId, employee.id))
      .limit(1);
    isHiringLead = Boolean(lead);
  }

  let regionOk = true;
  if (accessLevel === "regional_view" && !canManageAll && jobOpeningId) {
    const scopes = await db
      .select({
        locationId: employeeAccessScopes.locationId,
        country: employeeAccessScopes.country,
      })
      .from(employeeAccessScopes)
      .where(eq(employeeAccessScopes.employeeId, employee.id));
    const inRegion = employeeMatchesAccessScope(
      { locationId: jobLocationId, country: jobCountry },
      scopes
    );
    regionOk = isHiringLead || inRegion;
  }

  const allowed =
    canManageHiring({
      accessLevel,
      canManageUsers: permissions.canManageUsers,
      isHiringLead,
    }) && regionOk;

  return {
    allowed,
    canViewSalary: canViewOfferSalary({
      canViewCompensation: permissions.canViewCompensation,
      accessLevel: employee.accessLevel as AccessLevel,
      canManageUsers: permissions.canManageUsers,
    }),
    employee,
    permissions,
    notFound: false,
  };
}

export async function hiringAccessForCandidate(email: string, candidateId: number) {
  const [candidate] = await db
    .select({ jobOpeningId: candidates.jobOpeningId })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (!candidate) {
    return {
      allowed: false,
      canViewSalary: false,
      employee: null,
      permissions: null,
      notFound: true,
    };
  }

  return hiringAccessForEmail(email, candidate.jobOpeningId);
}
