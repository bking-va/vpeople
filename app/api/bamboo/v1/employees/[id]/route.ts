import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, departments, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // BambooHR-compatible single employee endpoint
  
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid API key required" },
      { status: 401 }
    );
  }
  
  try {
    const { id } = await params;
    const employeeId = parseInt(id);

    const [employee] = await db
      .select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        jobTitle: employees.jobTitle,
        department: departments.name,
        departmentId: employees.departmentId,
        location: locations.name,
        locationId: employees.locationId,
        workPhone: employees.workPhone,
        hireDate: employees.hireDate,
        employmentStatus: employees.employmentStatus,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(locations, eq(employees.locationId, locations.id))
      .where(eq(employees.id, employeeId));

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const bambooFormat = {
      id: employee.id.toString(),
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName: `${employee.firstName} ${employee.lastName}`,
      jobTitle: employee.jobTitle,
      department: employee.department,
      location: employee.location,
      workEmail: employee.email,
      workPhone: employee.workPhone,
      hireDate: employee.hireDate,
      status: employee.employmentStatus,
    };

    return NextResponse.json(bambooFormat);
  } catch (error: any) {
    console.error("Failed to fetch employee:", error);
    return NextResponse.json(
      { error: "Failed to fetch employee", message: error.message },
      { status: 500 }
    );
  }
}
