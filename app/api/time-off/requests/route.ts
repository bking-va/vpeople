import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, timeOffRequests, timeOffBalances } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  assertTimeOffSpan,
  requestDaysExcludingHolidays,
  TimeOffSpanError,
} from "@/lib/calendar-days";
import { loadCompanyHolidays } from "@/lib/holidays";
import { attachConfiguredTimeOffApproval } from "@/lib/time-off-workflow";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { policyId, startDate, endDate, reason, notes } = data;

    // Get employee ID
    if (!session.user.employeeId) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    const [employee] = await db
      .select({ id: employees.id, managerId: employees.managerId })
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    // Check balance
    const [balance] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, employee.id),
          eq(timeOffBalances.policyId, policyId)
        )
      )
      .limit(1);

    if (!balance) {
      return NextResponse.json(
        { error: "No balance found for this policy" },
        { status: 400 }
      );
    }

    let days: number;
    try {
      assertTimeOffSpan(String(startDate), String(endDate));
      const companyHolidays = await loadCompanyHolidays();
      days = requestDaysExcludingHolidays(
        String(startDate),
        String(endDate),
        companyHolidays
      );
    } catch (error) {
      if (error instanceof TimeOffSpanError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json(
        { error: "Invalid start or end date" },
        { status: 400 }
      );
    }
    if (days < 1) {
      return NextResponse.json(
        { error: "Request does not include any working days" },
        { status: 400 }
      );
    }

    const currentBalance = parseFloat(balance.balance || "0");
    if (days > currentBalance) {
      return NextResponse.json(
        { error: "Insufficient balance for this request" },
        { status: 400 }
      );
    }

    const [timeOffRequest] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: employee.id,
        policyId,
        startDate,
        endDate,
        daysRequested: days.toString(),
        notes,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
      })
      .returning();

    try {
      await attachConfiguredTimeOffApproval({
        timeOffRequestId: timeOffRequest.id,
        requesterId: employee.id,
      });
    } catch (error) {
      await db.delete(timeOffRequests).where(eq(timeOffRequests.id, timeOffRequest.id));
      throw error;
    }

    return NextResponse.json(timeOffRequest);
  } catch (error: any) {
    console.error("Failed to create time-off request:", error);
    return NextResponse.json(
      { error: "Failed to create request", message: error.message },
      { status: 500 }
    );
  }
}
