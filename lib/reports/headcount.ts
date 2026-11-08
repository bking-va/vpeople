import { db } from "@/lib/db";
import { employees, departments, locations } from "@/lib/db/schema";
import { eq, sql, or } from "drizzle-orm";
import { headcountToCsv } from "@/lib/reports/headcount-format";

export { headcountToCsv } from "@/lib/reports/headcount-format";

export async function getHeadcountReport() {
  const byDepartment = await db
    .select({
      departmentId: employees.departmentId,
      department: departments.name,
      count: sql<number>`count(*)::int`,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(
      or(
        eq(employees.employmentStatus, "full_time"),
        eq(employees.employmentStatus, "part_time"),
        eq(employees.employmentStatus, "contractor")
      )
    )
    .groupBy(employees.departmentId, departments.name)
    .orderBy(departments.name);

  const byLocation = await db
    .select({
      locationId: employees.locationId,
      location: locations.name,
      count: sql<number>`count(*)::int`,
    })
    .from(employees)
    .leftJoin(locations, eq(employees.locationId, locations.id))
    .where(
      or(
        eq(employees.employmentStatus, "full_time"),
        eq(employees.employmentStatus, "part_time"),
        eq(employees.employmentStatus, "contractor")
      )
    )
    .groupBy(employees.locationId, locations.name)
    .orderBy(locations.name);

  const byStatus = await db
    .select({
      employmentStatus: employees.employmentStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(employees)
    .groupBy(employees.employmentStatus)
    .orderBy(employees.employmentStatus);

  const totalActive = byDepartment.reduce((sum, row) => sum + row.count, 0);
  const terminated =
    byStatus.find((row) => row.employmentStatus === "terminated")?.count ?? 0;

  return {
    totalActive,
    terminated,
    byDepartment,
    byLocation,
    byStatus,
  };
}
