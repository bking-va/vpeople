import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, jobTitles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { JobTitleForm } from "@/components/job-title-form";

export default async function EditJobTitlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  const [jobTitle] = await db
    .select()
    .from(jobTitles)
    .where(eq(jobTitles.id, parseInt(id)))
    .limit(1);

  if (!jobTitle) {
    redirect("/settings/job-titles");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Job Title</h1>
        <p className="text-muted-foreground">Update {jobTitle.title}</p>
      </div>
      <JobTitleForm jobTitle={jobTitle} />
    </div>
  );
}
