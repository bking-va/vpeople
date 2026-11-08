"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeOffRequests, timeOffBalances, employees, approvalRequests } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";
import { approveStep, rejectStep, getApprovalRequestForEntity } from "@/lib/approvals";

export async function approveTimeOffRequest(requestId: number) {
  const session = await auth();

  if (!session?.user?.employeeId) {
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

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);

  if (!currentEmployee) {
    return { success: false, error: "Employee record not found" };
  }

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

  // Check if this request has an approval workflow
  const approvalData = await getApprovalRequestForEntity(
    "time_off_request",
    requestId
  );

  if (approvalData) {
    // Multi-step approval workflow
    const { request: approvalReq, steps } = approvalData;

    if (approvalReq.status !== "pending") {
      return {
        success: false,
        error: "Request has already been processed",
      };
    }

    // Find the current step
    const currentStep = steps.find((s) => s.step.stepOrder === approvalReq.currentStep);

    if (!currentStep) {
      return {
        success: false,
        error: "Invalid approval step",
      };
    }

    // Verify approver can approve this step
    const canApprove =
      (currentStep.step.approverId === currentEmployee.id) ||
      (currentStep.step.approverId === null && isAdmin);

    if (!canApprove) {
      return {
        success: false,
        error: "You are not authorized to approve this step",
      };
    }

    // Approve the step
    await approveStep(
      approvalReq.id,
      currentStep.step.stepOrder,
      currentEmployee.id
    );

    // Create audit log for this step approval
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
        stepOrder: currentStep.step.stepOrder,
        reviewedBy: currentEmployee.id,
      },
    });

    // If final approval, deduct balance
    const updatedApprovalData = await getApprovalRequestForEntity(
      "time_off_request",
      requestId
    );

    if (updatedApprovalData?.request.status === "approved") {
      const daysRequested = parseFloat(request.request.daysRequested);
      
      // Deduct balance (atomic operation)
      await db
        .update(timeOffBalances)
        .set({
          balance: sql`${timeOffBalances.balance} - ${daysRequested}::numeric`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(timeOffBalances.employeeId, request.request.employeeId),
            eq(timeOffBalances.policyId, request.request.policyId)
          )
        );
    }

    revalidatePath("/time-off");
    revalidatePath("/time-off/approvals");
    revalidatePath(`/people/${request.request.employeeId}`);

    return { success: true };
  } else {
    // Legacy single-step approval
    const daysRequested = parseFloat(request.request.daysRequested);

    // Update status
    await db
      .update(timeOffRequests)
      .set({
        status: "approved",
        reviewedBy: currentEmployee.id,
        reviewedAt: new Date(),
      })
      .where(eq(timeOffRequests.id, requestId));

    // Deduct balance
    await db
      .update(timeOffBalances)
      .set({
        balance: sql`${timeOffBalances.balance} - ${daysRequested}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timeOffBalances.employeeId, request.request.employeeId),
          eq(timeOffBalances.policyId, request.request.policyId)
        )
      );

    // Legacy single-step audit log
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
}

export async function denyTimeOffRequest(requestId: number, reason?: string) {
  const session = await auth();

  if (!session?.user?.employeeId) {
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

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);

  if (!currentEmployee) {
    return { success: false, error: "Employee record not found" };
  }

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

  // Check if this request has an approval workflow
  const approvalData = await getApprovalRequestForEntity(
    "time_off_request",
    requestId
  );

  if (approvalData) {
    // Multi-step approval workflow
    const { request: approvalReq, steps } = approvalData;

    if (approvalReq.status !== "pending") {
      return {
        success: false,
        error: "Request has already been processed",
      };
    }

    // Find the current step
    const currentStep = steps.find((s) => s.step.stepOrder === approvalReq.currentStep);

    if (!currentStep) {
      return {
        success: false,
        error: "Invalid approval step",
      };
    }

    // Verify approver can reject this step
    const canReject =
      (currentStep.step.approverId === currentEmployee.id) ||
      (currentStep.step.approverId === null && isAdmin);

    if (!canReject) {
      return {
        success: false,
        error: "You are not authorized to reject this step",
      };
    }

    // Reject the step
    await rejectStep(
      approvalReq.id,
      currentStep.step.stepOrder,
      currentEmployee.id,
      reason
    );

    // Create audit log for this step rejection
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
        stepOrder: currentStep.step.stepOrder,
        reviewedBy: currentEmployee.id,
        reason,
      },
    });

    revalidatePath("/time-off");
    revalidatePath("/time-off/approvals");
    revalidatePath(`/people/${request.request.employeeId}`);

    return { success: true };
  } else {
    // Legacy single-step denial
    await db
      .update(timeOffRequests)
      .set({
        status: "denied",
        reviewedBy: currentEmployee.id,
        reviewedAt: new Date(),
        reviewNotes: reason,
      })
      .where(eq(timeOffRequests.id, requestId));

    // Legacy single-step audit log
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
}
