"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeOffRequests, timeOffBalances, employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";

export async function approveTimeOffRequest(requestId: number) {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const [request] = await db
    .select({
      request: timeOffRequests,
      employee: employees,
    })
    .from(timeOffRequests)
    .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .where(eq(timeOffRequests.id, requestId))
    .limit(1);

  if (!request) {
    return { success: false, error: "Request not found" };
  }

  const currentUserEmployee = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!currentUserEmployee.length) {
    return { success: false, error: "Employee record not found" };
  }

  const currentEmployee = currentUserEmployee[0];

  const isManager = request.employee?.managerId === currentEmployee.id;
  const isAdmin = session.user.role === "admin" || currentEmployee.accessLevel === "full_admin";

  if (!isManager && !isAdmin) {
    return {
      success: false,
      error: "You do not have permission to approve this request",
    };
  }

  if (request.request.status !== "pending") {
    return {
      success: false,
      error: "Request has already been processed",
    };
  }

  await db
    .update(timeOffRequests)
    .set({
      status: "approved",
      reviewedBy: currentEmployee.id,
      reviewedAt: new Date(),
    })
    .where(eq(timeOffRequests.id, requestId));

  const daysRequested = parseFloat(request.request.daysRequested);

  await db
    .update(timeOffBalances)
    .set({
      balance: db.$with(
        `CAST(CAST(balance AS DECIMAL) - ${daysRequested} AS TEXT)`
      ) as any,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeOffBalances.employeeId, request.request.employeeId),
        eq(timeOffBalances.policyId, request.request.policyId)
      )
    );

  await createAuditLog({
    userId: session.user.id,
    action: "time_off_approved",
    entityType: "time_off_request",
    entityId: requestId.toString(),
    changes: {
      requestId,
      employeeId: request.request.employeeId,
      policyId: request.request.policyId,
      startDate: request.request.startDate,
      endDate: request.request.endDate,
      daysRequested: request.request.daysRequested,
      reviewedBy: currentEmployee.id,
    },
  });

  revalidatePath("/time-off");
  revalidatePath(`/people/${request.request.employeeId}`);

  return { success: true };
}

export async function denyTimeOffRequest(requestId: number, reason?: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const [request] = await db
    .select({
      request: timeOffRequests,
      employee: employees,
    })
    .from(timeOffRequests)
    .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .where(eq(timeOffRequests.id, requestId))
    .limit(1);

  if (!request) {
    return { success: false, error: "Request not found" };
  }

  const currentUserEmployee = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!currentUserEmployee.length) {
    return { success: false, error: "Employee record not found" };
  }

  const currentEmployee = currentUserEmployee[0];

  const isManager = request.employee?.managerId === currentEmployee.id;
  const isAdmin = session.user.role === "admin" || currentEmployee.accessLevel === "full_admin";

  if (!isManager && !isAdmin) {
    return {
      success: false,
      error: "You do not have permission to deny this request",
    };
  }

  if (request.request.status !== "pending") {
    return {
      success: false,
      error: "Request has already been processed",
    };
  }

  await db
    .update(timeOffRequests)
    .set({
      status: "denied",
      reviewedBy: currentEmployee.id,
      reviewedAt: new Date(),
      reviewNotes: reason,
    })
    .where(eq(timeOffRequests.id, requestId));

  await createAuditLog({
    userId: session.user.id,
    action: "time_off_denied",
    entityType: "time_off_request",
    entityId: requestId.toString(),
    changes: {
      requestId,
      employeeId: request.request.employeeId,
      policyId: request.request.policyId,
      startDate: request.request.startDate,
      endDate: request.request.endDate,
      daysRequested: request.request.daysRequested,
      reviewedBy: currentEmployee.id,
      reason,
    },
  });

  revalidatePath("/time-off");
  revalidatePath(`/people/${request.request.employeeId}`);

  return { success: true };
}
