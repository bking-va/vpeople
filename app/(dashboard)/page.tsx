import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  employees,
  timeOffBalances,
  timeOffPolicies,
  timeOffRequests,
  locations,
  departments,
  employeeTasks,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import {
  Calendar,
  Users,
  TrendingUp,
  MapPin,
  Cake,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { ClockWidget } from "@/components/clock-widget";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const employeeId = session.user.employeeId;
  if (!employeeId) {
    redirect("/people");
  }

  // Fetch current employee
  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!currentEmployee) {
    redirect("/people");
  }

  // Fetch time-off balances
  const timeOffData = await db
    .select({
      balance: timeOffBalances,
      policy: timeOffPolicies,
    })
    .from(timeOffBalances)
    .leftJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .where(eq(timeOffBalances.employeeId, employeeId));

  // Fetch direct reports
  const directReports = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      jobTitle: employees.jobTitle,
      photoUrl: employees.photoUrl,
    })
    .from(employees)
    .where(eq(employees.managerId, employeeId));

  // Fetch pending approvals for managers
  const isManager = directReports.length > 0;
  const isAdmin = session.user.role === "full_admin" || session.user.role === "admin";

  let pendingApprovals: any[] = [];
  if (isManager || isAdmin) {
    const reportIds = directReports.map((r) => r.id);
    
    const approvalsQuery = isAdmin
      ? db
          .select({
            request: timeOffRequests,
            employee: employees,
            policy: timeOffPolicies,
          })
          .from(timeOffRequests)
          .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
          .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
          .where(eq(timeOffRequests.status, "pending"))
          .limit(5)
      : reportIds.length > 0
        ? db
            .select({
              request: timeOffRequests,
              employee: employees,
              policy: timeOffPolicies,
            })
            .from(timeOffRequests)
            .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
            .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
            .where(
              and(
                eq(timeOffRequests.status, "pending"),
                inArray(timeOffRequests.employeeId, reportIds)
              )
            )
            .limit(5)
        : Promise.resolve([]);

    pendingApprovals = await approvalsQuery;
  }

  // Fetch my pending tasks
  const myTasks = await db
    .select()
    .from(employeeTasks)
    .where(
      and(
        eq(employeeTasks.employeeId, employeeId),
        eq(employeeTasks.status, "pending")
      )
    )
    .limit(5);

  // Fetch headcount by department
  const headcountByDept = await db
    .select({
      departmentId: employees.departmentId,
      department: departments,
      count: sql<number>`count(*)::int`,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.employmentStatus, "full_time"))
    .groupBy(employees.departmentId, departments.id, departments.name, departments.description, departments.createdAt, departments.updatedAt);

  // Fetch headcount by location
  const headcountByLocation = await db
    .select({
      locationId: employees.locationId,
      location: locations,
      count: sql<number>`count(*)::int`,
    })
    .from(employees)
    .leftJoin(locations, eq(employees.locationId, locations.id))
    .where(eq(employees.employmentStatus, "full_time"))
    .groupBy(employees.locationId, locations.id, locations.name, locations.address, locations.city, locations.province, locations.country, locations.postalCode, locations.timezone, locations.isHeadquarters, locations.createdAt, locations.updatedAt);

  // Fetch upcoming birthdays (next 30 days)
  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const allEmployees = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      birthDate: employees.birthDate,
      hireDate: employees.hireDate,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, "full_time"));

  // Filter for upcoming birthdays
  const upcomingBirthdays = allEmployees
    .filter((emp) => {
      if (!emp.birthDate) return false;
      const bday = new Date(emp.birthDate);
      const thisYearBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
      return thisYearBday >= today && thisYearBday <= thirtyDaysFromNow;
    })
    .sort((a, b) => {
      const aDate = new Date(a.birthDate!);
      const bDate = new Date(b.birthDate!);
      const aThisYear = new Date(today.getFullYear(), aDate.getMonth(), aDate.getDate());
      const bThisYear = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
      return aThisYear.getTime() - bThisYear.getTime();
    })
    .slice(0, 5);

  // Filter for work anniversaries
  const workAnniversaries = allEmployees
    .filter((emp) => {
      if (!emp.hireDate) return false;
      const hireDate = new Date(emp.hireDate);
      const thisYearAnniversary = new Date(today.getFullYear(), hireDate.getMonth(), hireDate.getDate());
      return thisYearAnniversary >= today && thisYearAnniversary <= thirtyDaysFromNow;
    })
    .sort((a, b) => {
      const aDate = new Date(a.hireDate!);
      const bDate = new Date(b.hireDate!);
      const aThisYear = new Date(today.getFullYear(), aDate.getMonth(), aDate.getDate());
      const bThisYear = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
      return aThisYear.getTime() - bThisYear.getTime();
    })
    .slice(0, 5);

  // Recent hires (last 30 days)
  const recentHires = allEmployees
    .filter((emp) => {
      if (!emp.hireDate) return false;
      const hireDate = new Date(emp.hireDate);
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      return hireDate >= thirtyDaysAgo && hireDate <= today;
    })
    .sort((a, b) => new Date(b.hireDate!).getTime() - new Date(a.hireDate!).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back, {currentEmployee.preferredName || currentEmployee.firstName}!
        </h1>
        <p className="text-muted-foreground">Here&apos;s what&apos;s happening today</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Clock In/Out Widget */}
        <ClockWidget />

        {/* Time Off Balances */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">My Time Off</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {timeOffData.length > 0 ? (
              <div className="space-y-2">
                {timeOffData.map((item) => (
                  <div key={item.balance.id} className="flex justify-between items-center">
                    <span className="text-sm">{item.policy?.name}</span>
                    <span className="text-sm font-bold">{item.balance.balance} days</span>
                  </div>
                ))}
                <Button asChild size="sm" className="w-full mt-2">
                  <Link href={`/people/${employeeId}#time-off`}>Request Time Off</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No time off policies assigned</p>
            )}
          </CardContent>
        </Card>

        {/* To-Do Feed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">My To-Do List</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {myTasks.length > 0 || pendingApprovals.length > 0 ? (
              <div className="space-y-2">
                {pendingApprovals.length > 0 && (
                  <div>
                    <Link
                      href="/time-off/approvals"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      {pendingApprovals.length} time-off approval{pendingApprovals.length !== 1 ? "s" : ""}
                    </Link>
                  </div>
                )}
                {myTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="text-sm">
                    <Link href="/tasks" className="text-primary hover:underline">
                      {task.title}
                    </Link>
                  </div>
                ))}
                {myTasks.length > 3 && (
                  <Link href="/tasks" className="text-sm text-muted-foreground hover:underline">
                    +{myTasks.length - 3} more tasks
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">All caught up! 🎉</p>
            )}
          </CardContent>
        </Card>

        {/* Direct Reports */}
        {isManager && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">My Team</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-2xl font-bold">{directReports.length}</div>
                <p className="text-xs text-muted-foreground">Direct Report{directReports.length !== 1 ? "s" : ""}</p>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href="/org-chart">View Org Chart</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Headcount */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Company Headcount</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {headcountByDept.reduce((sum, dept) => sum + dept.count, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Active Employees</p>
            <div className="mt-4 space-y-1 max-h-32 overflow-y-auto">
              {headcountByDept.map((dept) => (
                <div key={dept.departmentId} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{dept.department?.name || "No Department"}</span>
                  <span className="font-medium">{dept.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Location Distribution */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">By Location</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {headcountByLocation.map((loc) => (
                <div key={loc.locationId} className="flex justify-between items-center">
                  <span className="text-sm">{loc.location?.name || "No Location"}</span>
                  <Badge variant="secondary">{loc.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Celebrations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Celebrations</CardTitle>
            <Cake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingBirthdays.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Upcoming Birthdays</p>
                  {upcomingBirthdays.slice(0, 2).map((emp) => {
                    const bday = new Date(emp.birthDate!);
                    const thisYearBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
                    return (
                      <div key={emp.id} className="text-sm">
                        <Link href={`/people/${emp.id}`} className="text-primary hover:underline">
                          {emp.preferredName || emp.firstName} {emp.lastName}
                        </Link>
                        <span className="text-muted-foreground text-xs ml-1">
                          {formatDate(thisYearBday.toISOString())}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {workAnniversaries.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Work Anniversaries</p>
                  {workAnniversaries.slice(0, 2).map((emp) => {
                    const hireDate = new Date(emp.hireDate!);
                    const years = today.getFullYear() - hireDate.getFullYear();
                    return (
                      <div key={emp.id} className="text-sm">
                        <Link href={`/people/${emp.id}`} className="text-primary hover:underline">
                          {emp.preferredName || emp.firstName} {emp.lastName}
                        </Link>
                        <span className="text-muted-foreground text-xs ml-1">
                          {years} year{years !== 1 ? "s" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {upcomingBirthdays.length === 0 && workAnniversaries.length === 0 && (
                <p className="text-sm text-muted-foreground">No upcoming celebrations</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* New Team Members */}
        {recentHires.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">New Team Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentHires.map((emp) => (
                  <div key={emp.id} className="text-sm">
                    <Link href={`/people/${emp.id}`} className="text-primary hover:underline">
                      {emp.preferredName || emp.firstName} {emp.lastName}
                    </Link>
                    <span className="text-muted-foreground text-xs ml-1">
                      Joined {formatDate(emp.hireDate!)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Links */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Quick Links</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/people" className="block text-sm text-primary hover:underline">
                People Directory
              </Link>
              <Link href="/org-chart" className="block text-sm text-primary hover:underline">
                Org Chart
              </Link>
              <Link href="/seats" className="block text-sm text-primary hover:underline">
                Accountability Chart
              </Link>
              <Link href="/time-off" className="block text-sm text-primary hover:underline">
                Time Off
              </Link>
              {isAdmin && (
                <Link href="/admin" className="block text-sm text-primary hover:underline">
                  Admin Settings
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
