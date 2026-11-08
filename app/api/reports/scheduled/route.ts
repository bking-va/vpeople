import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { scheduledReports, savedReports, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const schedules = await db
      .select({
        schedule: scheduledReports,
        report: savedReports,
      })
      .from(scheduledReports)
      .leftJoin(savedReports, eq(scheduledReports.savedReportId, savedReports.id))
      .where(eq(scheduledReports.userId, employee.id));

    return NextResponse.json({ schedules });
  } catch (error: any) {
    console.error("Failed to fetch scheduled reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedules", message: error.message },
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
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      savedReportId,
      scheduleType,
      scheduleDay,
      scheduleTime,
      recipientEmails,
      format,
    } = body;

    if (!savedReportId || !scheduleType || !recipientEmails) {
      return NextResponse.json(
        { error: "Report ID, schedule type, and recipient emails are required" },
        { status: 400 }
      );
    }

    // Verify report ownership
    const [report] = await db
      .select()
      .from(savedReports)
      .where(eq(savedReports.id, savedReportId))
      .limit(1);

    if (!report || report.userId !== employee.id) {
      return NextResponse.json(
        { error: "Report not found or access denied" },
        { status: 404 }
      );
    }

    const [schedule] = await db
      .insert(scheduledReports)
      .values({
        savedReportId,
        userId: employee.id,
        scheduleType,
        scheduleDay: scheduleDay || null,
        scheduleTime: scheduleTime || "09:00:00",
        recipientEmails: JSON.stringify(recipientEmails),
        format: format || "csv",
        isActive: true,
      })
      .returning();

    return NextResponse.json({ schedule });
  } catch (error: any) {
    console.error("Failed to create scheduled report:", error);
    return NextResponse.json(
      { error: "Failed to create schedule", message: error.message },
      { status: 500 }
    );
  }
}
