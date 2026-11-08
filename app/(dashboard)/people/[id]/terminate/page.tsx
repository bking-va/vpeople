import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TerminateEmployeeForm } from "@/components/terminate-employee-form";

export default async function TerminateEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const resolvedParams = await params;
  const targetEmployeeId = parseInt(resolvedParams.id, 10);

  // Check if user has permission
  const currentEmployeeId = session.user.employeeId;
  if (!currentEmployeeId) {
    redirect("/people");
  }

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, currentEmployeeId))
    .limit(1);

  if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
    redirect("/people");
  }

  // Fetch the employee to terminate
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, targetEmployeeId))
    .limit(1);

  if (!employee) {
    redirect("/people");
  }

  if (employee.employmentStatus === "terminated") {
    redirect(`/people/${targetEmployeeId}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold">Terminate Employee</h1>
        <p className="text-muted-foreground">
          Process termination for {employee.firstName} {employee.lastName}
        </p>
      </div>

      <TerminateEmployeeForm employee={employee} />
    </div>
  );
}
