import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TimeOffPolicyForm } from "@/components/time-off-policy-form";

export default async function NewTimeOffPolicyPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Time Off Policy</h1>
        <p className="text-muted-foreground">
          Create a new time-off policy for employees
        </p>
      </div>

      <TimeOffPolicyForm />
    </div>
  );
}
