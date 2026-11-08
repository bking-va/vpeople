import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timesheets, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({ id: employees.id, accessLevel: employees.accessLevel })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // Managers can see all timesheets for approval
    const isManager = employee.accessLevel !== "employee";

    let results;
    if (!isManager) {
      // Employees see only their own
      results = await db
        .select()
        .from(timesheets)
        .where(eq(timesheets.employeeId, employee.id));
    } else if (status) {
      // Managers can filter by status
      results = await db
        .select()
        .from(timesheets)
        .where(eq(timesheets.status, status as any));
    } else {
      // Managers see all
      results = await db.select().from(timesheets);
    }

    return NextResponse.json({ timesheets: results });
  } catch (error: any) {
    console.error("Failed to fetch timesheets:", error);
    return NextResponse.json(
      { error: "Failed to fetch timesheets", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    const data = await request.json();

    const [timesheet] = await db
      .insert(timesheets)
      .values({
        employeeId: employee.id,
        weekStartDate: data.weekStartDate,
        weekEndDate: data.weekEndDate,
        totalHours: data.totalHours.toString(),
        status: "submitted",
        submittedAt: new Date(),
        notes: data.notes || null,
      })
      .returning();

    return NextResponse.json({ timesheet });
  } catch (error: any) {
    console.error("Failed to submit timesheet:", error);
    return NextResponse.json(
      { error: "Failed to submit timesheet", message: error.message },
      { status: 500 }
    );
  }
}
