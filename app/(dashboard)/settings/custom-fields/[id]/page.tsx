import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { employees, customFields } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CustomFieldForm } from "@/components/custom-field-form";

export default async function EditCustomFieldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  const fieldId = parseInt(id);

  const [field] = await db
    .select()
    .from(customFields)
    .where(eq(customFields.id, fieldId))
    .limit(1);

  if (!field) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Custom Field</h1>
        <p className="text-muted-foreground">
          Update custom field configuration
        </p>
      </div>

      <CustomFieldForm field={field} />
    </div>
  );
}
