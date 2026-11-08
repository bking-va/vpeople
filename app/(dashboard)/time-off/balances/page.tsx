import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, timeOffBalances, timeOffPolicies, timeOffRequests } from "@/lib/db/schema";
import { eq, gte, and } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function TimeOffBalancesPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/time-off");
  }

  const allBalances = await db
    .select({
      balance: timeOffBalances,
      employee: {
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
      },
      policy: {
        name: timeOffPolicies.name,
      },
    })
    .from(timeOffBalances)
    .leftJoin(employees, eq(timeOffBalances.employeeId, employees.id))
    .leftJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .orderBy(employees.lastName, employees.firstName);

  // Fetch all future requests to compute scheduled and pending days
  const allFutureRequests = await db
    .select()
    .from(timeOffRequests)
    .where(
      gte(timeOffRequests.startDate, new Date().toISOString().split("T")[0])
    );

  // Compute scheduled and pending days per employee per policy
  const scheduledByEmployeePolicy = new Map<string, number>();
  const pendingByEmployeePolicy = new Map<string, number>();

  for (const request of allFutureRequests) {
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

  // Enhance balances with available, pending, and scheduled
  // Note: stored balance already reflects approved deductions, so available = stored balance
  const balancesWithDetails = allBalances.map(item => {
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

      <Card>
        <CardHeader>
          <CardTitle>All Employee Balances</CardTitle>
          <CardDescription>
            Current balances by employee and policy
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
    </div>
  );
}
