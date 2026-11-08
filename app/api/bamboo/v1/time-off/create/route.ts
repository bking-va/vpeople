import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeOffRequests, timeOffBalances } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateApiKey } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid API key required" },
      { status: 401 }
    );
  }

  // Check permissions
  if (!auth.permissions.canApproveTimeOff) {
    return NextResponse.json(
      { error: "Forbidden", message: "Insufficient permissions to create time-off requests" },
      { status: 403 }
    );
  }

  try {
    const data = await request.json();

    // Required fields
    if (!data.employeeId || !data.policyId || !data.start || !data.end) {
      return NextResponse.json(
        { error: "Missing required fields: employeeId, policyId, start, end" },
        { status: 400 }
      );
    }

    // Calculate days
    const start = new Date(data.start);
    const end = new Date(data.end);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Check balance
    const [balance] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, data.employeeId),
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

    // Create request
    const [timeOffRequest] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: data.employeeId,
        policyId: data.policyId,
        startDate: data.start,
        endDate: data.end,
        daysRequested: days.toString(),
        notes: data.notes || null,
        status: data.status || "pending",
        reviewedBy: data.reviewedBy || null,
        reviewedAt: data.reviewedAt ? new Date(data.reviewedAt) : null,
      })
      .returning();

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
