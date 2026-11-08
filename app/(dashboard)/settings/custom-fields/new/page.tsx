import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CustomFieldForm } from "@/components/custom-field-form";

export default async function NewCustomFieldPage() {
  const session = await auth();
  if (!session?.user?.employeeId) {
    redirect("/settings");
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);

  if (!employee || employee.accessLevel !== "full_admin") {
    redirect("/settings");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Custom Field</h1>
        <p className="text-muted-foreground">
          Add a new custom field to employee profiles
        </p>
      </div>

      <CustomFieldForm />
    </div>
  );
}
