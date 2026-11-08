import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { 
  departments, 
  divisions, 
  locations, 
  jobFamilies, 
  jobLevels,
  employees
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { NewEmployeeWizard } from "@/components/new-employee-wizard";

export default async function NewEmployeePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  // Check if user has permission to add employees
  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
    redirect("/people");
  }

  // Fetch reference data for the form
  const [
    allDepartments,
    allDivisions,
    allLocations,
    allJobFamilies,
    allJobLevels,
    potentialManagers,
  ] = await Promise.all([
    db.select().from(departments).orderBy(departments.name),
    db.select().from(divisions).orderBy(divisions.name),
    db.select().from(locations).orderBy(locations.name),
    db.select().from(jobFamilies).orderBy(jobFamilies.name),
    db.select().from(jobLevels).orderBy(jobLevels.code),
    db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        jobTitle: employees.jobTitle,
      })
      .from(employees)
      .where(eq(employees.employmentStatus, "full_time"))
      .orderBy(employees.lastName),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold">Add New Employee</h1>
        <p className="text-muted-foreground">
          Complete the wizard to onboard a new employee
        </p>
      </div>

      <NewEmployeeWizard
        departments={allDepartments}
        divisions={allDivisions}
        locations={allLocations}
        jobFamilies={allJobFamilies}
        jobLevels={allJobLevels}
        managers={potentialManagers}
      />
    </div>
  );
}
