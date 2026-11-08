import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, departments, locations, divisions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fields = searchParams.get("fields")?.split(",") || [];
  const groupBy = searchParams.get("groupBy") || "none";

  try {
    const allEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.employmentStatus, "full_time"));

    const depts = await db.select().from(departments);
    const locs = await db.select().from(locations);
    const divs = await db.select().from(divisions);

    const deptMap = new Map(depts.map((d) => [d.id, d.name]));
    const locMap = new Map(locs.map((l) => [l.id, l.name]));
    const divMap = new Map(divs.map((d) => [d.id, d.name]));

    const enrichedData = allEmployees.map((emp) => ({
      employeeNumber: emp.employeeNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      jobTitle: emp.jobTitle,
      department: emp.departmentId ? deptMap.get(emp.departmentId) : null,
      division: emp.divisionId ? divMap.get(emp.divisionId) : null,
      location: emp.locationId ? locMap.get(emp.locationId) : null,
      hireDate: emp.hireDate,
      employmentStatus: emp.employmentStatus,
      workPhone: emp.workPhone,
      mobilePhone: emp.mobilePhone,
    }));

    // Filter to requested fields only
    const rows = enrichedData.map((row) => {
      const filtered: any = {};
      for (const field of fields) {
        filtered[field] = row[field as keyof typeof row] || null;
      }
      return filtered;
    });

    // Group if requested
    let result = rows;
    if (groupBy !== "none") {
      const grouped = rows.reduce((acc, row) => {
        const key = row[groupBy] || "Unassigned";
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(row);
        return acc;
      }, {} as Record<string, any[]>);

      result = Object.entries(grouped).flatMap(([group, items]) => [
        { _group: group, _groupCount: (items as any[]).length },
        ...(items as any[]),
      ]);
    }

    return NextResponse.json({ rows: result, count: rows.length });
  } catch (error: any) {
    console.error("Preview failed:", error);
    return NextResponse.json(
      { error: "Preview failed", message: error.message },
      { status: 500 }
    );
  }
}
