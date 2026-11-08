import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, timeOffPolicies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TimeOffPolicyForm } from "@/components/time-off-policy-form";

export default async function EditTimeOffPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  const policyId = parseInt(id);
  const [policy] = await db
    .select()
    .from(timeOffPolicies)
    .where(eq(timeOffPolicies.id, policyId))
    .limit(1);

  if (!policy) {
    redirect("/settings/time-off-policies");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Time Off Policy</h1>
        <p className="text-muted-foreground">
          Update {policy.name}
        </p>
      </div>

      <TimeOffPolicyForm policy={policy} />
    </div>
  );
}
