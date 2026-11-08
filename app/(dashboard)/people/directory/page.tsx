import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, departments, locations, peopleViews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PeopleDirectoryTable } from "@/components/people-directory-table";

export default async function PeopleDirectoryPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const [employee] = await db.query.employees.findMany({
    where: (employees, { eq }) => eq(employees.email, session.user.email),
    limit: 1,
  });

  if (!employee) {
    redirect("/auth/signin");
  }

  const views = await db
    .select()
    .from(peopleViews)
    .where(eq(peopleViews.userId, employee.id));

  const allEmployees = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      workPhone: employees.workPhone,
      jobTitle: employees.jobTitle,
      employmentStatus: employees.employmentStatus,
      departmentId: employees.departmentId,
      locationId: employees.locationId,
      hireDate: employees.hireDate,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, "full_time"));

  const depts = await db.select().from(departments);
  const locs = await db.select().from(locations);

  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const locMap = new Map(locs.map((l) => [l.id, l.name]));

  const enrichedEmployees = allEmployees.map((emp) => ({
    id: emp.id,
    employeeNumber: emp.employeeNumber,
    name: `${emp.firstName} ${emp.lastName}`,
    email: emp.email,
    jobTitle: emp.jobTitle,
    department: emp.departmentId ? deptMap.get(emp.departmentId) : null,
    location: emp.locationId ? locMap.get(emp.locationId) : null,
    hireDate: emp.hireDate,
    workPhone: emp.workPhone,
  }));

  return <PeopleDirectoryTable employees={enrichedEmployees} views={views} />;
}
