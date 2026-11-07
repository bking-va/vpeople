import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, departments, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKey } from "@/lib/bamboo-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  await params;
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!validateApiKey(apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allEmployees = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      jobTitle: employees.jobTitle,
      hireDate: employees.hireDate,
      employmentStatus: employees.employmentStatus,
      departmentId: employees.departmentId,
      locationId: employees.locationId,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, "full_time"));

  const depts = await db.select().from(departments);
  const locs = await db.select().from(locations);

  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const locMap = new Map(locs.map((l) => [l.id, l.name]));

  const report = allEmployees.map((emp) => ({
    employeeNumber: emp.employeeNumber,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    jobTitle: emp.jobTitle,
    department: emp.departmentId ? deptMap.get(emp.departmentId) : null,
    location: emp.locationId ? locMap.get(emp.locationId) : null,
    hireDate: emp.hireDate,
    status: emp.employmentStatus,
  }));

  return NextResponse.json({
    report,
    count: report.length,
    generatedAt: new Date().toISOString(),
  });
}
