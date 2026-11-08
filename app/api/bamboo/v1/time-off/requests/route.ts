import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeOffRequests, employees, timeOffPolicies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  // BambooHR-compatible time-off requests endpoint
  
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    let query = db
      .select({
        id: timeOffRequests.id,
        employeeId: timeOffRequests.employeeId,
        employee: {
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
        },
        policy: {
          name: timeOffPolicies.name,
        },
        startDate: timeOffRequests.startDate,
        endDate: timeOffRequests.endDate,
        daysRequested: timeOffRequests.daysRequested,
        status: timeOffRequests.status,
        notes: timeOffRequests.notes,
        createdAt: timeOffRequests.createdAt,
      })
      .from(timeOffRequests)
      .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
      .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id));

    const requests = await query;

    // Filter in memory (for simplicity)
    let filtered = requests;
    if (employeeId) {
      filtered = filtered.filter((r) => r.employeeId === parseInt(employeeId));
    }
    if (status) {
      filtered = filtered.filter((r) => r.status === status);
    }

    const bambooFormat = {
      requests: filtered.map((req) => ({
        id: req.id.toString(),
        employeeId: req.employeeId.toString(),
        employee: {
          name: `${req.employee?.firstName} ${req.employee?.lastName}`,
          email: req.employee?.email,
        },
        type: req.policy?.name || "Time Off",
        start: req.startDate,
        end: req.endDate,
        amount: req.daysRequested,
        status: req.status,
        notes: req.notes,
        created: req.createdAt,
      })),
    };

    return NextResponse.json(bambooFormat);
  } catch (error: any) {
    console.error("Failed to fetch time-off requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch time-off requests", message: error.message },
      { status: 500 }
    );
  }
}
