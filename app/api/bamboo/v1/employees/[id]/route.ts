import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, departments, locations, compensationHistory } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
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

    // Fetch latest compensation record
    const [latestComp] = await db
      .select()
      .from(compensationHistory)
      .where(eq(compensationHistory.employeeId, emp.id))
      .orderBy(desc(compensationHistory.effectiveDate))
      .limit(1);

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

    // Build base response
    const bambooFormat: any = {
      id: emp.id.toString(),
      employeeNumber: emp.employeeNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      displayName: `${emp.firstName} ${emp.lastName}`,
      jobTitle: emp.jobTitle,
      department: dept?.name,
      location: loc?.name,
      workEmail: emp.email,
      workPhone: emp.workPhone,
      hireDate: emp.hireDate,
      status: emp.employmentStatus,
    };

    // Include compensation fields if permitted and present
    if (auth.permissions.canViewCompensation && latestComp) {
      if (latestComp.payRate) bambooFormat.payRate = latestComp.payRate;
      if (latestComp.payType) bambooFormat.payType = latestComp.payType;
      if (latestComp.paySchedule) bambooFormat.paySchedule = latestComp.paySchedule;
      if (latestComp.currency) bambooFormat.currency = latestComp.currency;
    }

    return NextResponse.json(bambooFormat);
  } catch (error: any) {
    console.error("Failed to fetch employee:", error);
    return NextResponse.json(
      { error: "Failed to fetch employee", message: error.message },
      { status: 500 }
    );
  }
}
