import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, employeeAccessScopes, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserPermissions } from "@/lib/permissions";
import { canManageAccessScopes } from "@/lib/access-scopes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessScopeForm } from "@/components/access-scope-form";

export default async function AccessScopesPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.employeeId) redirect("/");

  const [actor] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!actor) redirect("/");
  const permissions = await getSessionUserPermissions(session);
  if (
    !canManageAccessScopes({
      employeeId: actor.id,
      accessLevel: actor.accessLevel,
      canManageUsers: permissions.canManageUsers,
    })
  ) {
    redirect("/settings");
  }

  const regionalEmployees = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
    })
    .from(employees)
    .where(eq(employees.accessLevel, "regional_view"));

  const scopes = await db.select().from(employeeAccessScopes);
  const allLocations = await db
    .select({ id: locations.id, name: locations.name, country: locations.country })
    .from(locations);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Regional access allowlists</h1>
        <p className="text-muted-foreground">
          regional_view users see only themselves until you assign locations or countries.
          full_admin is never region-scoped.
        </p>
      </div>
      {regionalEmployees.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No employees currently have regional_view.
          </CardContent>
        </Card>
      ) : (
        regionalEmployees.map((employee) => {
          const theirs = scopes.filter((scope) => scope.employeeId === employee.id);
          return (
            <Card key={employee.id}>
              <CardHeader>
                <CardTitle>
                  {employee.firstName} {employee.lastName}
                </CardTitle>
                <CardDescription>Employee ID {employee.id}</CardDescription>
              </CardHeader>
              <CardContent>
                <AccessScopeForm
                  employeeId={employee.id}
                  locations={allLocations}
                  locationIds={theirs
                    .map((scope) => scope.locationId)
                    .filter((id): id is number => id != null)}
                  countries={theirs
                    .map((scope) => scope.country)
                    .filter((country): country is string => Boolean(country))}
                />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
