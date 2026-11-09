import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, departments } from "@/lib/db/schema";
import { eq, or, inArray } from "drizzle-orm";
import { authenticateApiKey, filterEmployeeFields } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  // BambooHR-compatible employee directory API
  // Format matches BambooHR v1 API response structure
  
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid API key required" },
      { status: 401 }
    );
  }
  
  try {
    // Determine scope: admins see all, managers see their reports, employees see only themselves
    let scopedEmployees: any[];
    
    if (auth.permissions.canManageUsers) {
      // Full access - can see all employees
      scopedEmployees = await db
        .select()
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id));
    } else {
      // Get direct reports if manager
      const directReports = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.managerId, auth.employeeId));
      
      const reportIds = directReports.map(r => r.id);
      
      if (reportIds.length > 0) {
        // Manager: self + direct reports
        scopedEmployees = await db
          .select()
          .from(employees)
          .leftJoin(departments, eq(employees.departmentId, departments.id))
          .where(or(
            eq(employees.id, auth.employeeId),
            inArray(employees.id, reportIds)
          ));
      } else {
        // Regular employee: only self
        scopedEmployees = await db
          .select()
          .from(employees)
          .leftJoin(departments, eq(employees.departmentId, departments.id))
          .where(eq(employees.id, auth.employeeId));
      }
    }

    const bambooFormat = {
      employees: scopedEmployees.map((row) => {
        const emp = row.employees || row;
        const dept = row.departments;
        
        // Filter sensitive fields based on permissions
        const filtered = filterEmployeeFields(emp, auth.permissions, {
          isSelf: emp.id === auth.employeeId,
          isDirectory: true,
        });
        
        return {
          id: filtered.id.toString(),
          employeeNumber: filtered.employeeNumber,
          firstName: filtered.firstName,
          lastName: filtered.lastName,
          displayName: `${filtered.firstName} ${filtered.lastName}`,
          jobTitle: filtered.jobTitle,
          department: dept?.name,
          location: filtered.locationId?.toString(),
          workEmail: filtered.email,
          workPhone: filtered.workPhone,
          hireDate: filtered.hireDate,
        };
      }),
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
