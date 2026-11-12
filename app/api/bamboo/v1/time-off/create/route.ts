import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, timeOffRequests, timeOffBalances } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateApiKey } from "@/lib/api-auth";
import {
  assertTimeOffSpan,
  requestDaysExcludingHolidays,
  TimeOffSpanError,
} from "@/lib/calendar-days";
import { loadCompanyHolidays } from "@/lib/holidays";
import { isFullAdmin, isManagerAccessLevel, isViewingAccessLevel } from "@/lib/authz";
import { attachConfiguredTimeOffApproval } from "@/lib/time-off-workflow";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid API key required" },
      { status: 401 }
    );
  }

  if (isViewingAccessLevel(auth.accessLevel)) {
    return NextResponse.json(
      { error: "Forbidden", message: "Viewing roles cannot create time-off requests" },
      { status: 403 }
    );
  }

  try {
    const data = await request.json();

    if (!data.employeeId || !data.policyId || !data.start || !data.end) {
      return NextResponse.json(
        { error: "Missing required fields: employeeId, policyId, start, end" },
        { status: 400 }
      );
    }

    const targetEmployeeId = parseInt(data.employeeId, 10);
    if (Number.isNaN(targetEmployeeId)) {
      return NextResponse.json({ error: "Invalid employeeId" }, { status: 400 });
    }

    const canCreateForTarget = await canCreateTimeOffFor(auth, targetEmployeeId);
    if (!canCreateForTarget) {
      return NextResponse.json(
        { error: "Forbidden", message: "Cannot create time-off for this employee" },
        { status: 403 }
      );
    }

    let days: number;
    try {
      assertTimeOffSpan(String(data.start), String(data.end));
      const companyHolidays = await loadCompanyHolidays();
      days = requestDaysExcludingHolidays(
        String(data.start),
        String(data.end),
        companyHolidays
      );
    } catch (error) {
      if (error instanceof TimeOffSpanError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: "Invalid start or end date" }, { status: 400 });
    }
    if (days < 1) {
      return NextResponse.json(
        { error: "Request does not include any working days" },
        { status: 400 }
      );
    }

    const [balance] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, targetEmployeeId),
          eq(timeOffBalances.policyId, data.policyId)
        )
      )
      .limit(1);

    if (!balance) {
      return NextResponse.json(
        { error: "No balance found for this policy" },
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
        employeeId: targetEmployeeId,
        policyId: data.policyId,
        startDate: data.start,
        endDate: data.end,
        daysRequested: days.toString(),
        notes: data.notes || null,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
      })
      .returning();

    try {
      await attachConfiguredTimeOffApproval({
        timeOffRequestId: timeOffRequest.id,
        requesterId: targetEmployeeId,
      });
    } catch (error) {
      await db.delete(timeOffRequests).where(eq(timeOffRequests.id, timeOffRequest.id));
      throw error;
    }

    return NextResponse.json({
      id: timeOffRequest.id.toString(),
      employeeId: timeOffRequest.employeeId.toString(),
      start: timeOffRequest.startDate,
      end: timeOffRequest.endDate,
      amount: timeOffRequest.daysRequested,
      status: timeOffRequest.status,
      created: timeOffRequest.createdAt,
    });
  } catch (error: any) {
    console.error("Failed to create time-off request:", error);
    return NextResponse.json(
      { error: "Failed to create request", message: error.message },
      { status: 500 }
    );
  }
}

async function canCreateTimeOffFor(
  auth: {
    employeeId: number;
    accessLevel: string;
    permissions: { canManageUsers: boolean };
  },
  targetEmployeeId: number
) {
  if (targetEmployeeId === auth.employeeId) return true;
  if (isFullAdmin(auth.accessLevel) || auth.permissions.canManageUsers) return true;
  if (!isManagerAccessLevel(auth.accessLevel)) return false;

  const [target] = await db
    .select({ managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.id, targetEmployeeId))
    .limit(1);

  return target?.managerId === auth.employeeId;
}
