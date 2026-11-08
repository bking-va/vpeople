import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeClocks, timesheets, employees } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
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
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    
    // Calculate start of this week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Calculate start of this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get this week's clock hours
    const weekClockRecords = await db
      .select()
      .from(timeClocks)
      .where(
        and(
          eq(timeClocks.employeeId, employee.id),
          gte(timeClocks.clockIn, startOfWeek)
        )
      );

    let weekHours = 0;
    for (const record of weekClockRecords) {
      if (record.clockOut) {
        const duration =
          (new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime()) /
          (1000 * 60 * 60);
        weekHours += duration;
      }
    }

    // Get this month's approved timesheet hours
    const monthTimesheets = await db
      .select()
      .from(timesheets)
      .where(
        and(
          eq(timesheets.employeeId, employee.id),
          eq(timesheets.status, "approved"),
          gte(timesheets.weekStartDate, startOfMonth.toISOString().split("T")[0])
        )
      );

    const monthHours = monthTimesheets.reduce(
      (sum, sheet) => sum + parseFloat(sheet.totalHours.toString()),
      0
    );

    return NextResponse.json({
      weekHours,
      monthHours,
    });
  } catch (error: any) {
    console.error("Failed to fetch time summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary", message: error.message },
      { status: 500 }
    );
  }
}
