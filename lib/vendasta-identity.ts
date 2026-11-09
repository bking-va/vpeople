import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import {
  decideVendastaEmployeeAccess,
  isVendastaSubject,
  verifiedWorkEmailFromIdToken,
  type EmployeeIdentityRow,
  type VendastaIdTokenClaims,
} from "@/lib/vendasta-oidc";

const identityColumns = {
  id: employees.id,
  email: employees.email,
  vendastaSub: employees.vendastaSub,
  userId: employees.userId,
  accessLevel: employees.accessLevel,
  employmentStatus: employees.employmentStatus,
};

export async function findEmployeeByVendastaSub(
  sub: string
): Promise<EmployeeIdentityRow | null> {
  const [row] = await db
    .select(identityColumns)
    .from(employees)
    .where(eq(employees.vendastaSub, sub))
    .limit(1);
  return row ?? null;
}

export async function findEmployeeByVerifiedWorkEmail(
  email: string
): Promise<EmployeeIdentityRow | null> {
  const [row] = await db
    .select(identityColumns)
    .from(employees)
    .where(sql`lower(${employees.email}) = ${email}`)
    .limit(1);
  return row ?? null;
}

export async function authorizeVendastaSignIn(
  profile: VendastaIdTokenClaims | undefined
): Promise<boolean> {
  const decision = await decideFromProfile(profile);
  return decision.ok;
}

export async function linkVendastaEmployee(
  userId: string,
  profile: VendastaIdTokenClaims | undefined
): Promise<void> {
  const decision = await decideFromProfile(profile);
  if (!decision.ok || !isVendastaSubject(profile?.sub)) return;

  const sub = profile.sub.trim();
  const patch: {
    userId: string;
    vendastaSub?: string;
    updatedAt: Date;
  } = {
    userId,
    updatedAt: new Date(),
  };
  if (decision.bindSub) {
    patch.vendastaSub = sub;
  }

  await db
    .update(employees)
    .set(patch)
    .where(eq(employees.id, decision.employeeId));
}

async function decideFromProfile(profile: VendastaIdTokenClaims | undefined) {
  const claims = profile ?? {};
  const sub = isVendastaSubject(claims.sub) ? claims.sub.trim() : "";
  const employeeBySub = sub ? await findEmployeeByVendastaSub(sub) : null;
  const verifiedWorkEmail = verifiedWorkEmailFromIdToken(claims);
  const employeeByVerifiedWorkEmail = verifiedWorkEmail
    ? await findEmployeeByVerifiedWorkEmail(verifiedWorkEmail)
    : null;
  return decideVendastaEmployeeAccess(
    claims,
    employeeBySub,
    employeeByVerifiedWorkEmail
  );
}
