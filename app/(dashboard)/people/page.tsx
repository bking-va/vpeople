import Link from "next/link";
import { db } from "@/lib/db";
import { employees, departments, locations, peopleViews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin, Users, Table2, Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PeopleViewSelector } from "@/components/people-view-selector";
import { visibleDirectoryEmail } from "@/lib/authz";
import { getUserPermissions } from "@/lib/permissions";
import { employeeInScope, scopedEmployeeIds } from "@/lib/employee-scope";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const { view: selectedViewId } = await searchParams;

  const [employee] = await db.query.employees.findMany({
    where: (employees, { eq }) => eq(employees.email, session.user.email),
    limit: 1,
  });

  if (!employee) {
    redirect("/auth/signin");
  }

  const views = await db
    .select()
    .from(peopleViews)
    .where(eq(peopleViews.userId, employee.id));

  const permissions = await getUserPermissions(session.user.email);
  const allowed =
    employee.accessLevel === "regional_view"
      ? await scopedEmployeeIds({
          employeeId: employee.id,
          accessLevel: employee.accessLevel,
          canManageUsers: permissions.canManageUsers,
        })
      : "all";

  const allEmployees = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      email: employees.email,
      workPhone: employees.workPhone,
      extension: employees.extension,
      jobTitle: employees.jobTitle,
      employmentStatus: employees.employmentStatus,
      photoUrl: employees.photoUrl,
      departmentId: employees.departmentId,
      locationId: employees.locationId,
      managerId: employees.managerId,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, "full_time"))
    .orderBy(employees.lastName, employees.firstName);

  const visibleEmployees = allEmployees.filter((row) => employeeInScope(row.id, allowed));

  const depts = await db.select().from(departments);
  const locs = await db.select().from(locations);

  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const locMap = new Map(locs.map((l) => [l.id, l.name]));

  const directReportCounts = new Map<number, number>();
  for (const emp of allEmployees) {
    if (emp.managerId) {
      directReportCounts.set(
        emp.managerId,
        (directReportCounts.get(emp.managerId) || 0) + 1
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">People Directory</h1>
          <p className="text-muted-foreground">
            {visibleEmployees.length} active employees
          </p>
        </div>
        <div className="flex gap-2">
          <PeopleViewSelector views={views} />
          <Link href="/people/directory">
            <Button variant="outline">
              <Table2 className="mr-2 h-4 w-4" />
              Table View
            </Button>
          </Link>
          <Link href="/api/reports/export?type=employees">
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleEmployees.map((employee) => {
          const displayName = employee.preferredName
            ? `${employee.preferredName} ${employee.lastName}`
            : `${employee.firstName} ${employee.lastName}`;

          const dept = employee.departmentId
            ? deptMap.get(employee.departmentId)
            : null;
          const location = employee.locationId
            ? locMap.get(employee.locationId)
            : null;
          const reportCount = directReportCounts.get(employee.id) || 0;

          return (
            <Link key={employee.id} href={`/people/${employee.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{displayName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {employee.jobTitle || "No title"}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {employee.employeeNumber}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      {dept && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{dept}</span>
                        </div>
                      )}
                      {location && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <span className="truncate">
                          {visibleDirectoryEmail(employee.email, {
                            isSelf: employee.id === session.user.employeeId,
                          }) || "—"}
                        </span>
                      </div>
                      {employee.workPhone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>
                            {employee.workPhone}
                            {employee.extension ? ` x${employee.extension}` : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    {reportCount > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          {reportCount} direct report{reportCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
