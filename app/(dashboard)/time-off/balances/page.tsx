import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, timeOffBalances, timeOffPolicies, timeOffRequests, timeOffBalanceAdjustments } from "@/lib/db/schema";
import { eq, gte, desc } from "drizzle-orm";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getUserPermissions } from "@/lib/permissions";
import { canManageTimeOffOperations, canViewTimeOffLedger } from "@/lib/authz";
import { employeeInScope, scopedEmployeeIds } from "@/lib/employee-scope";
import { TimeOffAdjustmentForm } from "@/components/time-off-adjustment-form";

export default async function TimeOffBalancesPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.employeeId) {
    redirect("/time-off");
  }

  const permissions = await getUserPermissions(session.user.email);
  const [viewer] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!viewer) {
    redirect("/time-off");
  }

  const canManage = canManageTimeOffOperations({
    accessLevel: viewer.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });
  if (!canManage) {
    redirect("/time-off");
  }

  const allowed = await scopedEmployeeIds({
    employeeId: viewer.id,
    accessLevel: viewer.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });
  const canViewHistory = canViewTimeOffLedger({
    isViewingSelf: false,
    isManager: false,
    canManageUsers: permissions.canManageUsers,
    accessLevel: viewer.accessLevel,
  });

  const allBalances = await db
    .select({
      balance: timeOffBalances,
      employee: {
        firstName: employees.firstName,
        lastName: employees.lastName,
      },
      policy: {
        name: timeOffPolicies.name,
      },
    })
    .from(timeOffBalances)
    .leftJoin(employees, eq(timeOffBalances.employeeId, employees.id))
    .leftJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .orderBy(employees.lastName, employees.firstName);

  const scopedBalances = allBalances.filter((item) =>
    employeeInScope(item.balance.employeeId, allowed)
  );

  const allFutureRequests = await db
    .select()
    .from(timeOffRequests)
    .where(
      gte(timeOffRequests.startDate, new Date().toISOString().split("T")[0])
    );

  const scheduledByEmployeePolicy = new Map<string, number>();
  const pendingByEmployeePolicy = new Map<string, number>();

  for (const request of allFutureRequests) {
    if (!employeeInScope(request.employeeId, allowed)) continue;
    const days = parseFloat(request.daysRequested);
    const key = `${request.employeeId}-${request.policyId}`;

    if (request.status === "approved") {
      const current = scheduledByEmployeePolicy.get(key) || 0;
      scheduledByEmployeePolicy.set(key, current + days);
    } else if (request.status === "pending") {
      const current = pendingByEmployeePolicy.get(key) || 0;
      pendingByEmployeePolicy.set(key, current + days);
    }
  }

  const recentAdjustments = canViewHistory
    ? (
        await db
          .select({
            id: timeOffBalanceAdjustments.id,
            amount: timeOffBalanceAdjustments.amount,
            reason: timeOffBalanceAdjustments.reason,
            createdAt: timeOffBalanceAdjustments.createdAt,
            employeeId: timeOffBalances.employeeId,
            firstName: employees.firstName,
            lastName: employees.lastName,
            policyName: timeOffPolicies.name,
          })
          .from(timeOffBalanceAdjustments)
          .innerJoin(timeOffBalances, eq(timeOffBalanceAdjustments.balanceId, timeOffBalances.id))
          .innerJoin(employees, eq(timeOffBalances.employeeId, employees.id))
          .leftJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
          .orderBy(desc(timeOffBalanceAdjustments.createdAt))
          .limit(100)
      ).filter((row) => employeeInScope(row.employeeId, allowed)).slice(0, 50)
    : [];

  const balancesWithDetails = scopedBalances.map((item) => {
    const key = `${item.balance.employeeId}-${item.balance.policyId}`;
    const totalBalance = parseFloat(item.balance.balance);
    const scheduled = scheduledByEmployeePolicy.get(key) || 0;
    const pending = pendingByEmployeePolicy.get(key) || 0;
    return {
      ...item,
      availableBalance: Math.max(0, totalBalance),
      pendingDays: pending,
      scheduledDays: scheduled,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Time Off Balances</h1>
          <p className="text-muted-foreground">
            View and adjust employee time off balances
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/time-off">Back to Time Off</Link>
        </Button>
      </div>

      <TimeOffAdjustmentForm
        balances={balancesWithDetails.map((item) => ({
          employeeId: item.balance.employeeId,
          policyId: item.balance.policyId,
          label: `${item.employee?.firstName || ""} ${item.employee?.lastName || ""} · ${item.policy?.name || "Policy"} (${item.availableBalance.toFixed(1)}d)`,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Employee balances</CardTitle>
          <CardDescription>
            Current balances by employee and policy (in-scope only)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {balancesWithDetails.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 border-b last:border-0">
                <div className="flex-1">
                  <div className="font-medium">
                    {item.employee?.firstName} {item.employee?.lastName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {item.policy?.name || "Unknown Policy"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    {item.availableBalance.toFixed(1)} days available
                  </div>
                  {(item.pendingDays > 0 || item.scheduledDays > 0) && (
                    <div className="text-xs text-muted-foreground mt-1">
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
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {canViewHistory && (
      <Card>
        <CardHeader>
          <CardTitle>Balance History</CardTitle>
          <CardDescription>
            Accruals, carryover forfeits, used leave, and manual adjustments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentAdjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No balance adjustments yet</p>
          ) : (
            <div className="space-y-1">
              {recentAdjustments.map((row) => {
                const amount = parseFloat(row.amount);
                return (
                  <div key={row.id} className="flex items-center justify-between p-3 border-b last:border-0">
                    <div>
                      <div className="font-medium">
                        {row.firstName} {row.lastName} · {row.policyName || "Time off"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {row.reason} · {formatDate(row.createdAt)}
                      </div>
                    </div>
                    <span className={amount < 0 ? "text-destructive" : "text-emerald-700"}>
                      {amount > 0 ? "+" : ""}
                      {amount.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
