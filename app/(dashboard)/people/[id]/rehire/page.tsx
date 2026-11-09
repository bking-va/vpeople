import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { RehireEmployeeForm } from "@/components/rehire-employee-form";

export default async function RehireEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const { id } = await params;
  const targetEmployeeId = parseInt(id, 10);
  const currentEmployeeId = session.user.employeeId;
  if (!currentEmployeeId) redirect("/people");

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, currentEmployeeId))
    .limit(1);

  if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
    redirect("/people");
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, targetEmployeeId))
    .limit(1);

  if (!employee) redirect("/people");
  if (employee.employmentStatus !== "terminated") {
    redirect(`/people/${targetEmployeeId}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold">Rehire Employee</h1>
        <p className="text-muted-foreground">
          Reactivate {employee.firstName} {employee.lastName} with a new hire date
        </p>
      </div>
      <RehireEmployeeForm employee={employee} />
    </div>
  );
}
