import { db } from "@/lib/db";
import { employees, departments, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DirectoryFilters } from "@/components/directory-filters";

export default async function DirectoryPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const allEmployees = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      email: employees.email,
      workPhone: employees.workPhone,
      extension: employees.extension,
      jobTitle: employees.jobTitle,
      departmentId: employees.departmentId,
      locationId: employees.locationId,
      managerId: employees.managerId,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, "full_time"))
    .orderBy(employees.lastName, employees.firstName);

  const depts = await db.select().from(departments);
  const locs = await db.select().from(locations);

  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const locMap = new Map(locs.map((l) => [l.id, l.name]));

  const directReportCounts = new Map<number, number>();
  for (const emp of allEmployees) {
    if (emp.managerId) {
      directReportCounts.set(
        emp.managerId,
        (directReportCounts.get(emp.managerId) || 0) + 1
      );
    }
  }

  const employeesWithDetails = allEmployees.map((emp) => ({
    ...emp,
    departmentName: emp.departmentId ? deptMap.get(emp.departmentId) || null : null,
    locationName: emp.locationId ? locMap.get(emp.locationId) || null : null,
    reportCount: directReportCounts.get(emp.id) || 0,
  }));

  return (
    <DirectoryFilters
      employees={employeesWithDetails}
      departments={depts}
      locations={locs}
    />
  );
}
