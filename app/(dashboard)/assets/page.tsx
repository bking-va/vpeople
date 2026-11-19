import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employeeAssets, employees } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUserPermissions } from "@/lib/permissions";
import { scopedEmployeeIds } from "@/lib/employee-scope";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function AssetsPage() {
  const session = await auth();
  if (!session?.user?.employeeId) {
    redirect("/auth/signin");
  }

  const [actor] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!actor) {
    redirect("/auth/signin");
  }

  const permissions = await getSessionUserPermissions(session);
  const allowed = await scopedEmployeeIds({
    employeeId: actor.id,
    accessLevel: actor.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });

  const columns = {
    id: employeeAssets.id,
    name: employeeAssets.name,
    category: employeeAssets.category,
    serialNumber: employeeAssets.serialNumber,
    assignedDate: employeeAssets.assignedDate,
    employeeId: employeeAssets.employeeId,
    firstName: employees.firstName,
    lastName: employees.lastName,
    preferredName: employees.preferredName,
  };

  const rows =
    allowed === "all"
      ? await db
          .select(columns)
          .from(employeeAssets)
          .innerJoin(employees, eq(employeeAssets.employeeId, employees.id))
          .orderBy(desc(employeeAssets.assignedDate))
      : allowed.size === 0
        ? []
        : await db
            .select(columns)
            .from(employeeAssets)
            .innerJoin(employees, eq(employeeAssets.employeeId, employees.id))
            .where(inArray(employeeAssets.employeeId, [...allowed]))
            .orderBy(desc(employeeAssets.assignedDate));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assets</h1>
        <p className="text-muted-foreground">
          Company equipment assigned in BambooHR. {rows.length} records in your
          scope.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Assigned equipment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets in scope</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="border rounded-lg p-3 text-sm grid md:grid-cols-4 gap-2"
              >
                <div>
                  <p className="text-muted-foreground">Employee</p>
                  <Link
                    href={`/people/${row.employeeId}?tab=assets`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.preferredName || row.firstName} {row.lastName}
                  </Link>
                </div>
                <div>
                  <p className="text-muted-foreground">Asset</p>
                  <p className="font-medium">{row.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Serial</p>
                  <p className="font-medium">{row.serialNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Assigned</p>
                  <p className="font-medium">
                    {formatDate(row.assignedDate) || "—"}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
