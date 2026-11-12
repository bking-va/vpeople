import { db } from "@/lib/db";
import { timeOffRequests, employees, timeOffPolicies } from "@/lib/db/schema";
import { eq, or, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TimeOffActions } from "@/components/time-off-actions";
import { CalendarFeeds } from "@/components/calendar-feeds";
import { getUserPermissions } from "@/lib/permissions";
import { isFullAdmin } from "@/lib/authz";

export default async function TimeOffPage() {
  const session = await auth();

  if (!session?.user?.employeeId) {
    redirect("/people");
  }

  const employeeId = session.user.employeeId;

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) {
    redirect("/people");
  }

  const directReports = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.managerId, employeeId));

  const reportIds = directReports.map((r) => r.id);

  const pendingRequests = await db
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
        or(
          eq(timeOffRequests.employeeId, employeeId),
          ...(reportIds.length > 0
            ? reportIds.map((id) => eq(timeOffRequests.employeeId, id))
            : [])
        )
      )
    );

  const myRequests = await db
    .select({
      request: timeOffRequests,
      policy: timeOffPolicies,
    })
    .from(timeOffRequests)
    .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
    .where(eq(timeOffRequests.employeeId, employeeId));

  const pendingApprovals = pendingRequests.filter(
    (r) => r.request.employeeId !== employeeId
  );

  const isManager = reportIds.length > 0;
  const isAdmin = session.user.role === "full_admin" || session.user.role === "admin";
  const permissions = session.user.email
    ? await getUserPermissions(session.user.email)
    : null;
  const canViewAllBalances =
    Boolean(permissions?.canManageUsers) || isFullAdmin(employee.accessLevel);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Time Off</h1>
          <p className="text-muted-foreground">Manage time off requests and balances</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/time-off/request">Request Time Off</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/time-off/calendar">Who&apos;s Out</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/time-off/holidays">Holidays</Link>
          </Button>
          {(isManager || isAdmin) && (
            <Button asChild variant="outline">
              <Link href="/time-off/approvals">View All Approvals</Link>
            </Button>
          )}
          {canViewAllBalances && (
            <Button asChild variant="outline">
              <Link href="/time-off/balances">All Balances</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/people/${employeeId}#time-off`}>View My Balances</Link>
          </Button>
        </div>
      </div>

      {pendingApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals ({pendingApprovals.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingApprovals.map((item) => {
              const emp = item.employee;
              const req = item.request;
              const policy = item.policy;

              const empName = emp
                ? emp.preferredName
                  ? `${emp.preferredName} ${emp.lastName}`
                  : `${emp.firstName} ${emp.lastName}`
                : "Unknown";

              return (
                <div
                  key={req.id}
                  className="flex items-center justify-between border-b pb-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/people/${emp?.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {empName}
                      </Link>
                      <Badge variant="secondary">{policy?.name}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(req.startDate)} - {formatDate(req.endDate)} (
                      {req.daysRequested} days)
                    </p>
                    {req.notes && (
                      <p className="text-sm text-muted-foreground">{req.notes}</p>
                    )}
                  </div>
                  <TimeOffActions requestId={req.id} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My Time Off Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {myRequests.length > 0 ? (
            <div className="space-y-4">
              {myRequests.map((item) => {
                const req = item.request;
                const policy = item.policy;

                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between border-b pb-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {formatDate(req.startDate)} - {formatDate(req.endDate)}
                        </p>
                        <Badge variant="secondary">{policy?.name}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {req.daysRequested} days
                      </p>
                      {req.notes && (
                        <p className="text-sm text-muted-foreground">{req.notes}</p>
                      )}
                    </div>
                    <Badge
                      variant={
                        req.status === "approved"
                          ? "default"
                          : req.status === "pending"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {req.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">No time off requests</p>
          )}
        </CardContent>
      </Card>

      <CalendarFeeds employeeId={employee.id} />
    </div>
  );
}
