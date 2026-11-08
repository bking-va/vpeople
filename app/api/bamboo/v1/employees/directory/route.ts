import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, departments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  // BambooHR-compatible employee directory API
  // Format matches BambooHR v1 API response structure
  
  try {
    const allEmployees = await db
      .select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        jobTitle: employees.jobTitle,
        department: departments.name,
        location: employees.locationId,
        workPhone: employees.workPhone,
        hireDate: employees.hireDate,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id));

    const bambooFormat = {
      employees: allEmployees.map((emp) => ({
        id: emp.id.toString(),
        employeeNumber: emp.employeeNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        displayName: `${emp.firstName} ${emp.lastName}`,
        jobTitle: emp.jobTitle,
        department: emp.department,
        location: emp.location?.toString(),
        workEmail: emp.email,
        workPhone: emp.workPhone,
        hireDate: emp.hireDate,
      })),
    };

    return NextResponse.json(bambooFormat);
  } catch (error: any) {
    console.error("Failed to fetch employee directory:", error);
    return NextResponse.json(
      { error: "Failed to fetch employee directory", message: error.message },
      { status: 500 }
    );
  }
}
