import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { jobOpenings, departments, locations, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { JobOpeningForm } from "@/components/job-opening-form";
import { getSessionUserPermissions } from "@/lib/permissions";
import { visibleProfileEmail } from "@/lib/authz";

export default async function EditJobOpeningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/hiring/openings");
  }

  const { id } = await params;
  const openingId = parseInt(id);

  const [opening] = await db
    .select()
    .from(jobOpenings)
    .where(eq(jobOpenings.id, openingId));

  if (!opening) {
    notFound();
  }

  const depts = await db.select().from(departments);
  const locs = await db.select().from(locations);
  const permissions = await getSessionUserPermissions(session);
  const managers = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
    })
    .from(employees)
    .where(eq(employees.accessLevel, "manager"));
  const hiringLeads = managers.map((lead) => ({
    ...lead,
    email:
      visibleProfileEmail(lead.email, {
        isViewingSelf: lead.id === session.user.employeeId,
        canViewSensitivePersonalInfo: Boolean(permissions?.canViewSensitivePersonalInfo),
      }) || "",
  }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Job Opening</h1>
        <p className="text-muted-foreground">
          Update position details
        </p>
      </div>

      <JobOpeningForm
        departments={depts}
        locations={locs}
        hiringLeads={hiringLeads}
        opening={opening}
      />
    </div>
  );
}
