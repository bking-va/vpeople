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
  timesheets,
  documents,
  announcements,
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
import { getWhosOut } from "@/lib/whos-out";
import { isOutOnDate } from "@/lib/date-overlap";
import { getTurnoverReport } from "@/lib/reports/turnover";
import { getPeopleWithoutRaise } from "@/lib/reports/standard";

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

  // Fetch all future requests (approved = scheduled, pending = pending)
  const allFutureRequests = await db
    .select()
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.employeeId, employeeId),
        gte(timeOffRequests.startDate, new Date().toISOString().split("T")[0])
      )
    );

  // Compute days scheduled and pending for each policy
  const scheduledDaysByPolicy = new Map<number, number>();
  const pendingDaysByPolicy = new Map<number, number>();
  
  for (const request of allFutureRequests) {
    const days = parseFloat(request.daysRequested);
    
    if (request.status === "approved") {
      const current = scheduledDaysByPolicy.get(request.policyId) || 0;
      scheduledDaysByPolicy.set(request.policyId, current + days);
    } else if (request.status === "pending") {
      const current = pendingDaysByPolicy.get(request.policyId) || 0;
      pendingDaysByPolicy.set(request.policyId, current + days);
    }
  }

  // Add available, pending, and scheduled to each item
  // Note: stored balance already reflects approved deductions, so available = stored balance
  const timeOffDataWithAvailable = timeOffData.map(item => {
    const totalBalance = parseFloat(item.balance.balance);
    const scheduled = scheduledDaysByPolicy.get(item.balance.policyId) || 0;
    const pending = pendingDaysByPolicy.get(item.balance.policyId) || 0;
    return {
      ...item,
      availableBalance: Math.max(0, totalBalance),
      pendingDays: pending,
      scheduledDays: scheduled,
    };
  });

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

  // Fetch pending timesheet approvals for managers
  let pendingTimesheetApprovals: any[] = [];
  if (isManager || isAdmin) {
    const reportIds = directReports.map((r) => r.id);
    
    const timesheetApprovalsQuery = isAdmin
      ? db
          .select({
            timesheet: timesheets,
            employee: employees,
          })
          .from(timesheets)
          .leftJoin(employees, eq(timesheets.employeeId, employees.id))
          .where(eq(timesheets.status, "submitted"))
          .limit(5)
      : reportIds.length > 0
        ? db
            .select({
              timesheet: timesheets,
              employee: employees,
            })
            .from(timesheets)
            .leftJoin(employees, eq(timesheets.employeeId, employees.id))
            .where(
              and(
                eq(timesheets.status, "submitted"),
                inArray(timesheets.employeeId, reportIds)
              )
            )
            .limit(5)
        : Promise.resolve([]);

    pendingTimesheetApprovals = await timesheetApprovalsQuery;
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

  const pendingSignatureDocs = await db
    .select({
      id: documents.id,
      title: documents.title,
    })
    .from(documents)
    .where(
      and(
        eq(documents.employeeId, employeeId),
        eq(documents.status, "pending_signature")
      )
    )
    .limit(5);

  const turnover = isAdmin ? await getTurnoverReport() : null;
  const peopleWithoutRaise = isAdmin ? await getPeopleWithoutRaise() : [];

  const onboardingAsOf = new Date().toISOString().slice(0, 10);
  const onboardingTasks = isAdmin
    ? await db
        .select({
          id: employeeTasks.id,
          title: employeeTasks.title,
          dueDate: employeeTasks.dueDate,
          status: employeeTasks.status,
        })
        .from(employeeTasks)
        .where(
          and(
            eq(employeeTasks.taskType, "onboarding"),
            eq(employeeTasks.status, "pending")
          )
        )
    : [];
  const onboardingOverdue = onboardingTasks.filter(
    (task) => task.dueDate && task.dueDate < onboardingAsOf
  );
  const onboardingScheduled = onboardingTasks.filter(
    (task) => !task.dueDate || task.dueDate >= onboardingAsOf
  );

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

  const todayKey = today.toISOString().split("T")[0];
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const weekEndKey = weekEnd.toISOString().split("T")[0];
  const whosOut = await getWhosOut(todayKey, weekEndKey);
  const outToday = whosOut.filter(
    (item) => item.startDate && item.endDate && isOutOnDate(item.startDate, item.endDate, todayKey)
  );

  const now = new Date();
  const activeAnnouncements = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.isActive, true),
        sql`(${announcements.expiresAt} IS NULL OR ${announcements.expiresAt} >= ${now})`
      )
    )
    .orderBy(sql`${announcements.publishedAt} desc`)
    .limit(5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back, {currentEmployee.preferredName || currentEmployee.firstName}!
        </h1>
        <p className="text-muted-foreground">Here&apos;s what&apos;s happening today</p>
      </div>

      {activeAnnouncements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Announcements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeAnnouncements.map((item) => (
              <div key={item.id} className="border-l-2 border-primary pl-3">
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
            {timeOffDataWithAvailable.length > 0 ? (
              <div className="space-y-3">
                {timeOffDataWithAvailable.map((item) => (
                  <div key={item.balance.id} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{item.policy?.name}</span>
                      <span className="text-sm font-bold">{item.availableBalance.toFixed(1)} days</span>
                    </div>
                    {(item.pendingDays > 0 || item.scheduledDays > 0) && (
                      <div className="text-xs text-muted-foreground pl-1">
                        {item.pendingDays > 0 && (
                          <span>Pending: {item.pendingDays} days</span>
                        )}
                        {item.pendingDays > 0 && item.scheduledDays > 0 && <span> • </span>}
                        {item.scheduledDays > 0 && (
                          <span>Scheduled: {item.scheduledDays} days</span>
                        )}
                      </div>
                    )}
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
            {myTasks.length > 0 || pendingApprovals.length > 0 || pendingTimesheetApprovals.length > 0 || pendingSignatureDocs.length > 0 ? (
              <div className="space-y-2">
                {pendingSignatureDocs.length > 0 && (
                  <div>
                    <Link
                      href={`/people/${employeeId}?tab=documents`}
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      {pendingSignatureDocs.length} document{pendingSignatureDocs.length !== 1 ? "s" : ""} to sign
                    </Link>
                    {pendingSignatureDocs.slice(0, 2).map((doc) => (
                      <p key={doc.id} className="text-xs text-muted-foreground pl-4">
                        {doc.title}
                      </p>
                    ))}
                  </div>
                )}
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
                {pendingTimesheetApprovals.length > 0 && (
                  <div>
                    <Link
                      href="/time-tracking"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      {pendingTimesheetApprovals.length} timesheet approval{pendingTimesheetApprovals.length !== 1 ? "s" : ""}
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

        {turnover && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Turnover (12 mo)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{turnover.turnoverRate}%</div>
              <p className="text-xs text-muted-foreground">
                {turnover.terminations} terms · {turnover.hires} hires
              </p>
              <div className="mt-3 flex items-end gap-1 h-16">
                {turnover.byMonth.map((row) => {
                  const max = Math.max(1, ...turnover.byMonth.map((m) => m.hires + m.terms));
                  const height = ((row.hires + row.terms) / max) * 100;
                  return (
                    <div
                      key={row.month}
                      className="flex-1 bg-primary/70 rounded-sm"
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${row.month}: ${row.hires} hired, ${row.terms} left`}
                    />
                  );
                })}
              </div>
              <Button asChild size="sm" variant="outline" className="w-full mt-3">
                <Link href="/reports/turnover">View report</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">No raise in 12+ months</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{peopleWithoutRaise.length}</div>
              <p className="text-xs text-muted-foreground">Active employees</p>
              <div className="mt-2 space-y-1">
                {peopleWithoutRaise.slice(0, 3).map((row) => (
                  <Link
                    key={row.id}
                    href={`/people/${row.id}`}
                    className="block text-xs text-primary hover:underline truncate"
                  >
                    {row.firstName} {row.lastName}
                    {row.lastRaiseDate ? ` · ${row.lastRaiseDate}` : " · never"}
                  </Link>
                ))}
              </div>
              <Button asChild size="sm" variant="outline" className="w-full mt-3">
                <Link href="/reports/standard?type=no-raise">View report</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Onboarding tasks</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onboardingOverdue.length}</div>
              <p className="text-xs text-muted-foreground">
                Overdue · {onboardingScheduled.length} scheduled
              </p>
              <Button asChild size="sm" variant="outline" className="w-full mt-3">
                <Link href="/onboarding">Open onboarding</Link>
              </Button>
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

        {/* Who's Out */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Who&apos;s Out</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {outToday.length > 0 ? (
              <div className="space-y-2">
                {outToday.slice(0, 5).map((item) => (
                  <div key={item.requestId} className="text-sm">
                    {item.employeeId ? (
                      <Link href={`/people/${item.employeeId}`} className="text-primary hover:underline">
                        {item.preferredName || item.firstName} {item.lastName}
                      </Link>
                    ) : (
                      <span>Unknown</span>
                    )}
                    <span className="text-muted-foreground text-xs ml-1">
                      {item.policyName || "Time off"}
                    </span>
                  </div>
                ))}
                <Button asChild size="sm" variant="outline" className="w-full mt-2">
                  <Link href="/time-off/calendar">View calendar</Link>
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground">Nobody is out today</p>
                <Button asChild size="sm" variant="outline" className="w-full mt-2">
                  <Link href="/time-off/calendar">View calendar</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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
