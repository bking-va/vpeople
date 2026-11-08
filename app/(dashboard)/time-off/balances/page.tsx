import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, timeOffBalances, timeOffPolicies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
            {allBalances.map((item, idx) => (
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
                    {item.balance.balance} days
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
