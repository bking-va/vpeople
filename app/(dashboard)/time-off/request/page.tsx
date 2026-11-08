import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, timeOffPolicies, timeOffBalances } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeOffRequestForm } from "@/components/time-off-request-form";

export default async function TimeOffRequestPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.email, session.user.email!))
    .limit(1);

  if (!employee) {
    redirect("/");
  }

  const balances = await db
    .select({
      id: timeOffBalances.id,
      balance: timeOffBalances.balance,
      policyId: timeOffBalances.policyId,
      policyName: timeOffPolicies.name,
      policyType: timeOffPolicies.policyType,
    })
    .from(timeOffBalances)
    .leftJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .where(eq(timeOffBalances.employeeId, employee.id));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Request Time Off</h1>
        <p className="text-muted-foreground">
          Submit a time-off request for manager approval
        </p>
      </div>

      {balances.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-lg font-semibold mb-2">No Time Off Policies</p>
              <p className="text-muted-foreground">
                You don&apos;t have any time-off policies assigned yet. Contact HR to get set up.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <TimeOffRequestForm employeeId={employee.id} balances={balances} />
      )}
    </div>
  );
}
