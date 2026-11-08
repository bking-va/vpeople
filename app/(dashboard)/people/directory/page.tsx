import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, departments, locations, peopleViews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Download, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { PeopleViewSelector } from "@/components/people-view-selector";

export default async function PeopleDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ columns?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const { columns: selectedColumns } = await searchParams;

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
      extension: employees.extension,
      jobTitle: employees.jobTitle,
      employmentStatus: employees.employmentStatus,
      departmentId: employees.departmentId,
      locationId: employees.locationId,
      hireDate: employees.hireDate,
      managerId: employees.managerId,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, "full_time"));

  const depts = await db.select().from(departments);
  const locs = await db.select().from(locations);

  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const locMap = new Map(locs.map((l) => [l.id, l.name]));

  const enrichedEmployees = allEmployees.map((emp) => ({
    ...emp,
    department: emp.departmentId ? deptMap.get(emp.departmentId) : null,
    location: emp.locationId ? locMap.get(emp.locationId) : null,
    name: `${emp.firstName} ${emp.lastName}`,
  }));

  // Determine visible columns
  const defaultColumns = ["employeeNumber", "name", "email", "jobTitle", "department", "location"];
  const visibleColumns = selectedColumns ? selectedColumns.split(",") : defaultColumns;

  const columnConfig: Record<string, { label: string; render: (emp: typeof enrichedEmployees[0]) => any }> = {
    employeeNumber: { label: "Employee #", render: (e) => e.employeeNumber },
    name: { label: "Name", render: (e) => e.name },
    email: { label: "Email", render: (e) => e.email },
    jobTitle: { label: "Job Title", render: (e) => e.jobTitle },
    department: { label: "Department", render: (e) => e.department || "-" },
    location: { label: "Location", render: (e) => e.location || "-" },
    hireDate: { label: "Hire Date", render: (e) => e.hireDate || "-" },
    workPhone: { label: "Work Phone", render: (e) => e.workPhone || "-" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">People Directory</h1>
          <p className="text-muted-foreground">
            {enrichedEmployees.length} active employees
          </p>
        </div>
        <div className="flex gap-2">
          <PeopleViewSelector views={views} />
          <Link href="/people">
            <Button variant="outline">
              <LayoutGrid className="mr-2 h-4 w-4" />
              Grid View
            </Button>
          </Link>
          <Link href="/api/reports/export?type=employees">
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              {visibleColumns.map((col) => (
                <th key={col} className="px-4 py-3 text-left text-sm font-medium">
                  {columnConfig[col]?.label || col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {enrichedEmployees.map((emp) => (
              <tr key={emp.id} className="hover:bg-muted/50">
                {visibleColumns.map((col) => (
                  <td key={col} className="px-4 py-3 text-sm">
                    {col === "name" ? (
                      <Link
                        href={`/people/${emp.id}`}
                        className="font-medium hover:underline"
                      >
                        {columnConfig[col]?.render(emp)}
                      </Link>
                    ) : (
                      columnConfig[col]?.render(emp) || "-"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
