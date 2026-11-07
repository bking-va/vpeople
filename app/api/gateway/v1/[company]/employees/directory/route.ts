import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, departments, divisions, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKey, formatBambooEmployee } from "@/lib/bamboo-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  await params;
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!validateApiKey(apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const fields = searchParams.get("fields");

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
      mobilePhone: employees.mobilePhone,
      jobTitle: employees.jobTitle,
      hireDate: employees.hireDate,
      employmentStatus: employees.employmentStatus,
      photoUrl: employees.photoUrl,
      departmentId: employees.departmentId,
      divisionId: employees.divisionId,
      locationId: employees.locationId,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, "full_time"));

  const depts = await db.select().from(departments);
  const divs = await db.select().from(divisions);
  const locs = await db.select().from(locations);

  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const divMap = new Map(divs.map((d) => [d.id, d.name]));
  const locMap = new Map(locs.map((l) => [l.id, l.name]));

  const formattedEmployees = allEmployees.map((emp) => {
    const employee = {
      ...emp,
      departmentName: emp.departmentId ? deptMap.get(emp.departmentId) : null,
      divisionName: emp.divisionId ? divMap.get(emp.divisionId) : null,
      locationName: emp.locationId ? locMap.get(emp.locationId) : null,
    };

    return formatBambooEmployee(employee, fields || undefined);
  });

  return NextResponse.json({
    employees: formattedEmployees,
    count: formattedEmployees.length,
  });
}
