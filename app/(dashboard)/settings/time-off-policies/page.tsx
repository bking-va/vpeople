import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { timeOffPolicies, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { TimeOffPolicyList } from "@/components/time-off-policy-list";

export default async function TimeOffPoliciesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const employeeId = session.user.employeeId;
  if (!employeeId) {
    redirect("/settings");
  }

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
    redirect("/settings");
  }

  const policies = await db
    .select()
    .from(timeOffPolicies)
    .orderBy(timeOffPolicies.name);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Time Off Policies</h1>
          <p className="text-muted-foreground">
            Manage vacation, sick leave, and other time-off policies
          </p>
        </div>
        <Link href="/settings/time-off-policies/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Policy
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Policies</CardTitle>
          <CardDescription>
            {policies.length} {policies.length === 1 ? "policy" : "policies"} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimeOffPolicyList policies={policies} />
        </CardContent>
      </Card>
    </div>
  );
}
