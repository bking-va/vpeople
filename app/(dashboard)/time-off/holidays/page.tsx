import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, holidays } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserPermissions } from "@/lib/permissions";
import { canManageTimeOffOperations } from "@/lib/authz";
import { HolidayManager } from "@/components/holiday-manager";

export default async function HolidaysPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const allHolidays = await db.select().from(holidays).orderBy(holidays.date);

  const [actor] = session.user.employeeId
    ? await db
        .select({ accessLevel: employees.accessLevel })
        .from(employees)
        .where(eq(employees.id, session.user.employeeId))
        .limit(1)
    : [null];
  const permissions = await getUserPermissions(session.user.email);
  const canManage = canManageTimeOffOperations({
    accessLevel: actor?.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Company Holidays</h1>
        <p className="text-muted-foreground">
          Official holidays used when counting time-off request days
        </p>
      </div>

      <HolidayManager holidays={allHolidays} canManage={canManage} />
    </div>
  );
}
