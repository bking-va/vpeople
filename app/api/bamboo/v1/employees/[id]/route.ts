import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, departments, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey, filterEmployeeFields } from "@/lib/api-auth";

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
    const requestedEmployeeId = parseInt(id);

    const [employee] = await db
      .select()
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(locations, eq(employees.locationId, locations.id))
      .where(eq(employees.id, requestedEmployeeId))
      .limit(1);

    if (!employee || !employee.employees) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const emp = employee.employees;
    const dept = employee.departments;
    const loc = employee.locations;

    // Check access scope: can only view self, direct reports, or all if admin
    const canAccess = 
      auth.permissions.canManageUsers || // Admin can see all
      emp.id === auth.employeeId || // Can see self
      emp.managerId === auth.employeeId; // Can see direct reports

    if (!canAccess) {
      return NextResponse.json(
        { error: "Forbidden", message: "You do not have permission to view this employee" },
        { status: 403 }
      );
    }

    // Filter sensitive fields based on permissions
    const filtered = filterEmployeeFields(emp, auth.permissions);

    const bambooFormat = {
      id: filtered.id.toString(),
      employeeNumber: filtered.employeeNumber,
      firstName: filtered.firstName,
      lastName: filtered.lastName,
      displayName: `${filtered.firstName} ${filtered.lastName}`,
      jobTitle: filtered.jobTitle,
      department: dept?.name,
      location: loc?.name,
      workEmail: filtered.email,
      workPhone: filtered.workPhone,
      hireDate: filtered.hireDate,
      status: filtered.employmentStatus,
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
