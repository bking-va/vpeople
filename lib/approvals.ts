import { db } from "@/lib/db";
import {
  approvalRequests,
  approvalRequestSteps,
  approvalWorkflows,
  approvalWorkflowSteps,
  employees,
  timeOffRequests,
  timesheets,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface CreateApprovalRequestParams {
  workflowId: number;
  entityType: "time_off_request" | "timesheet";
  entityId: number;
  requesterId: number;
}

export async function createApprovalRequest(params: CreateApprovalRequestParams) {
  const { workflowId, entityType, entityId, requesterId } = params;

  // Fetch workflow and steps
  const workflow = await db
    .select()
    .from(approvalWorkflows)
    .where(eq(approvalWorkflows.id, workflowId))
    .limit(1);

  if (!workflow || workflow.length === 0 || !workflow[0].enabled) {
    throw new Error("Workflow not found or disabled");
  }

  const steps = await db
    .select()
    .from(approvalWorkflowSteps)
    .where(eq(approvalWorkflowSteps.workflowId, workflowId))
    .orderBy(approvalWorkflowSteps.stepOrder);

  if (steps.length === 0) {
    // No steps defined, auto-approve
    return null;
  }

  // Fetch requester to determine manager
  const [requester] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, requesterId))
    .limit(1);

  // Create approval request
  const [request] = await db
    .insert(approvalRequests)
    .values({
      workflowId,
      entityType,
      entityId,
      requesterId,
      status: "pending",
      currentStep: 1,
    })
    .returning();

  // Create approval request steps
  for (const step of steps) {
    let approverId: number | null = null;

    // Determine approver based on role
    if (step.approverRole === "manager" && requester.managerId) {
      approverId = requester.managerId;
    } else if (step.approverRole === "admin" || step.approverRole === "hr") {
      // For now, leave approverId null for admin/HR approvals
      // These will be shown to all admins/HR users
      approverId = null;
    }

    await db.insert(approvalRequestSteps).values({
      approvalRequestId: request.id,
      stepOrder: step.stepOrder,
      approverId,
      status: step.stepOrder === 1 ? "pending" : "pending",
    });
  }

  return request;
}

export async function approveStep(
  approvalRequestId: number,
  stepOrder: number,
  approverId: number,
  comments?: string
) {
  // Update the step
  await db
    .update(approvalRequestSteps)
    .set({
      status: "approved",
      approverId,
      comments,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(approvalRequestSteps.approvalRequestId, approvalRequestId),
        eq(approvalRequestSteps.stepOrder, stepOrder)
      )
    );

  // Fetch all steps to check if all are approved
  const allSteps = await db
    .select()
    .from(approvalRequestSteps)
    .where(eq(approvalRequestSteps.approvalRequestId, approvalRequestId))
    .orderBy(approvalRequestSteps.stepOrder);

  const allApproved = allSteps.every((s) => s.status === "approved");

  if (allApproved) {
    // All steps approved, mark request as approved
    const [request] = await db
      .update(approvalRequests)
      .set({ status: "approved" })
      .where(eq(approvalRequests.id, approvalRequestId))
      .returning();

    // Update entity status
    if (request.entityType === "time_off_request") {
      await db
        .update(timeOffRequests)
        .set({
          status: "approved",
          reviewedBy: approverId,
          reviewedAt: new Date(),
        })
        .where(eq(timeOffRequests.id, request.entityId));
    } else if (request.entityType === "timesheet") {
      await db
        .update(timesheets)
        .set({
          status: "approved",
          reviewedBy: approverId,
          reviewedAt: new Date(),
        })
        .where(eq(timesheets.id, request.entityId));
    }
  } else {
    // Move to next step
    const nextStep = allSteps.findIndex((s) => s.status === "pending");
    if (nextStep !== -1) {
      await db
        .update(approvalRequests)
        .set({ currentStep: allSteps[nextStep].stepOrder })
        .where(eq(approvalRequests.id, approvalRequestId));
    }
  }
}

export async function rejectStep(
  approvalRequestId: number,
  stepOrder: number,
  approverId: number,
  comments?: string
) {
  // Update the step
  await db
    .update(approvalRequestSteps)
    .set({
      status: "rejected",
      approverId,
      comments,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(approvalRequestSteps.approvalRequestId, approvalRequestId),
        eq(approvalRequestSteps.stepOrder, stepOrder)
      )
    );

  // Mark request as rejected
  const [request] = await db
    .update(approvalRequests)
    .set({ status: "rejected" })
    .where(eq(approvalRequests.id, approvalRequestId))
    .returning();

  // Update entity status
  if (request.entityType === "time_off_request") {
    await db
      .update(timeOffRequests)
      .set({
        status: "denied",
        reviewedBy: approverId,
        reviewedAt: new Date(),
        reviewNotes: comments,
      })
      .where(eq(timeOffRequests.id, request.entityId));
  } else if (request.entityType === "timesheet") {
    await db
      .update(timesheets)
      .set({
        status: "rejected",
        reviewedBy: approverId,
        reviewedAt: new Date(),
        notes: comments,
      })
      .where(eq(timesheets.id, request.entityId));
  }
}

export async function getApprovalRequestForEntity(
  entityType: "time_off_request" | "timesheet",
  entityId: number
) {
  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.entityType, entityType),
        eq(approvalRequests.entityId, entityId)
      )
    )
    .limit(1);

  if (!request) return null;

  const steps = await db
    .select({
      step: approvalRequestSteps,
      approver: employees,
    })
    .from(approvalRequestSteps)
    .leftJoin(
      employees,
      eq(approvalRequestSteps.approverId, employees.id)
    )
    .where(eq(approvalRequestSteps.approvalRequestId, request.id))
    .orderBy(approvalRequestSteps.stepOrder);

  return {
    request,
    steps,
  };
}
