import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { JobTitleForm } from "@/components/job-title-form";

export default async function NewJobTitlePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const employeeId = session.user.employeeId;
  if (!employeeId) redirect("/settings");

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
        <h1 className="text-3xl font-bold">New Job Title</h1>
        <p className="text-muted-foreground">Add a title to the organizational list</p>
      </div>
      <JobTitleForm />
    </div>
  );
}
