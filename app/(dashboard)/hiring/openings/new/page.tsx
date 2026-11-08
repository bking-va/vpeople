import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { departments, locations, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { JobOpeningForm } from "@/components/job-opening-form";

export default async function NewJobOpeningPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/hiring/openings");
  }

  const depts = await db.select().from(departments);
  const locs = await db.select().from(locations);
  const managers = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
    })
    .from(employees)
    .where(eq(employees.accessLevel, "manager"));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Job Opening</h1>
        <p className="text-muted-foreground">
          Add a new position to start receiving applications
        </p>
      </div>

      <JobOpeningForm
        departments={depts}
        locations={locs}
        hiringLeads={managers}
      />
    </div>
  );
}
