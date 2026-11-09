import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, employees, jobOpenings } from "@/lib/db/schema";
import { canManageHiring, canViewOfferSalary, type AccessLevel } from "@/lib/authz";
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
  let isHiringLead = false;
  if (jobOpeningId) {
    const [opening] = await db
      .select({ hiringLeadId: jobOpenings.hiringLeadId })
      .from(jobOpenings)
      .where(eq(jobOpenings.id, jobOpeningId))
      .limit(1);
    isHiringLead = opening?.hiringLeadId === employee.id;
  }

  const allowed = canManageHiring({
    accessLevel: employee.accessLevel as AccessLevel,
    canManageUsers: permissions.canManageUsers,
    isHiringLead,
  });

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
