import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeOffRequests, employees, timeOffPolicies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey } from "@/lib/api-auth";
import { isFullAdmin, isManagerAccessLevel, isViewingAccessLevel } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid API key required" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    const allowedIds = await allowedTimeOffEmployeeIds(auth);

    if (employeeId) {
      const requestedId = parseInt(employeeId, 10);
      if (Number.isNaN(requestedId) || (allowedIds !== "all" && !allowedIds.has(requestedId))) {
        return NextResponse.json(
          { error: "Forbidden", message: "Cannot view this employee's time-off history" },
          { status: 403 }
        );
      }
    }

    const requests = await db
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

    let filtered = requests;
    if (allowedIds !== "all") {
      filtered = filtered.filter((r) => allowedIds.has(r.employeeId));
    }
    if (employeeId) {
      filtered = filtered.filter((r) => r.employeeId === parseInt(employeeId, 10));
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

async function allowedTimeOffEmployeeIds(auth: {
  employeeId: number;
  accessLevel: string;
  permissions: { canManageUsers: boolean };
}): Promise<Set<number> | "all"> {
  if (
    isFullAdmin(auth.accessLevel) ||
    auth.permissions.canManageUsers ||
    isViewingAccessLevel(auth.accessLevel)
  ) {
    return "all";
  }

  const allowed = new Set<number>([auth.employeeId]);
  if (isManagerAccessLevel(auth.accessLevel)) {
    const reports = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.managerId, auth.employeeId));
    for (const report of reports) allowed.add(report.id);
  }
  return allowed;
}
