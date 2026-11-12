import { auth } from "@/lib/auth";
import { getSessionUserPermissions } from "@/lib/permissions";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { EmployeeScopeViewer } from "@/lib/employee-scope";

export async function getReportViewer() {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return { session: null, viewer: null };
  }

  const [actor] = await db
    .select({
      id: employees.id,
      accessLevel: employees.accessLevel,
      email: employees.email,
    })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);

  if (!actor) {
    return { session: null, viewer: null };
  }

  const permissions = await getSessionUserPermissions(session);

  return {
    session,
    viewer: {
      employeeId: actor.id,
      accessLevel: actor.accessLevel,
      canManageUsers: Boolean(permissions?.canManageUsers),
      canViewCompensation: Boolean(permissions?.canViewCompensation),
      canViewSensitivePersonalInfo: Boolean(permissions?.canViewSensitivePersonalInfo),
    },
  };
}
