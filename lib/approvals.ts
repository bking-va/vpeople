import { db } from "@/lib/db";
import {
  approvalRequests,
  approvalRequestSteps,
  approvalWorkflows,
  approvalWorkflowSteps,
  employees,
  timeOffRequests,
  timesheets,
  compensationHistory,
  jobHistory,
  timeOffBalances,
} from "@/lib/db/schema";
import { eq, and, or, sql, inArray, isNull } from "drizzle-orm";
import { createAuditLog } from "@/lib/audit";
import { isApproverBlockedFromActing } from "@/lib/approval-errors";

export { isApproverBlockedFromActing } from "@/lib/approval-errors";

export interface CreateApprovalRequestParams {
  workflowId: number;
  entityType: "time_off_request" | "timesheet" | "compensation_change" | "job_info_change";
  entityId: number;
  requesterId: number;
  metadata?: any;
}

export async function createApprovalRequest(params: CreateApprovalRequestParams) {
  const { workflowId, entityType, entityId, requesterId, metadata } = params;

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
    return { success: false, error: "No workflow steps defined" };
  }

  // Fetch requester to determine manager
  const [requester] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, requesterId))
    .limit(1);

  // For compensation_change and job_info_change, fetch the affected employee
  let affectedEmployee = requester;
  if (entityType === "compensation_change" || entityType === "job_info_change") {
    const [affected] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, entityId))
      .limit(1);
    if (affected) {
      affectedEmployee = affected;
    }
  }

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
      metadata: metadata || null,
    })
    .returning();

  // Create approval request steps
  for (const step of steps) {
    let approverId: number | null = null;
    let stepStatus: "pending" | "approved" | "rejected" | "skipped" = "pending";

    // Determine approver based on role
    if (step.approverRole === "manager") {
      if (affectedEmployee.managerId) {
        approverId = affectedEmployee.managerId;
      } else {
        // No manager (e.g., CEO) - auto-approve this step
        stepStatus = "approved";
      }
    } else if (step.approverRole === "manager_manager") {
      if (affectedEmployee.managerId) {
        // Get manager's manager
        const [manager] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, affectedEmployee.managerId))
          .limit(1);
        if (manager && manager.managerId) {
          approverId = manager.managerId;
        } else {
          // Manager has no manager - auto-approve this step
          stepStatus = "approved";
        }
      } else {
        // No manager - auto-approve this step
        stepStatus = "approved";
      }
    } else if (step.approverRole === "admin" || step.approverRole === "hr" || step.approverRole === "full_admin") {
      // For admin/HR/full_admin, leave null - shown to all with that access level
      approverId = null;
    }

    await db.insert(approvalRequestSteps).values({
      approvalRequestId: request.id,
      stepOrder: step.stepOrder,
      approverId,
      status: stepStatus,
      reviewedAt: stepStatus === "approved" ? new Date() : null,
    });
  }

  // If first step(s) are auto-approved, advance to next pending step
  const allCreatedSteps = await db
    .select()
    .from(approvalRequestSteps)
    .where(eq(approvalRequestSteps.approvalRequestId, request.id))
    .orderBy(approvalRequestSteps.stepOrder);

  let currentStepOrder = 1;
  for (const step of allCreatedSteps) {
    if (step.status !== "approved") {
      currentStepOrder = step.stepOrder;
      break;
    }
  }

  // Check if all steps are auto-approved
  const allApproved = allCreatedSteps.every((s) => s.status === "approved");
  if (allApproved) {
    // All steps auto-approved, mark request as approved
    await db
      .update(approvalRequests)
      .set({ status: "approved", currentStep: currentStepOrder })
      .where(eq(approvalRequests.id, request.id));
  } else if (currentStepOrder > 1) {
    // Some steps skipped, update currentStep
    await db
      .update(approvalRequests)
      .set({ currentStep: currentStepOrder })
      .where(eq(approvalRequests.id, request.id));
  }

  return { success: true, requestId: request.id, request };
}

export async function approveStep(
  approvalRequestId: number,
  stepOrder: number,
  approverId: number,
  comments?: string
) {
  // Fetch the step and its workflow definition to verify authorization
  const [stepData] = await db
    .select({
      step: approvalRequestSteps,
      request: approvalRequests,
      workflowStep: approvalWorkflowSteps,
    })
    .from(approvalRequestSteps)
    .innerJoin(approvalRequests, eq(approvalRequestSteps.approvalRequestId, approvalRequests.id))
    .innerJoin(
      approvalWorkflowSteps,
      and(
        eq(approvalWorkflowSteps.workflowId, approvalRequests.workflowId),
        eq(approvalWorkflowSteps.stepOrder, approvalRequestSteps.stepOrder)
      )
    )
    .where(
      and(
        eq(approvalRequestSteps.approvalRequestId, approvalRequestId),
        eq(approvalRequestSteps.stepOrder, stepOrder)
      )
    )
    .limit(1);

  if (!stepData) {
    throw new Error("Approval step not found");
  }

  const { step, request, workflowStep } = stepData;

  if (step.status !== "pending") {
    throw new Error("Step has already been processed");
  }

  // Verify this is the current step (no earlier pending steps)
  const earlierPendingSteps = await db
    .select()
    .from(approvalRequestSteps)
    .where(
      and(
        eq(approvalRequestSteps.approvalRequestId, approvalRequestId),
        eq(approvalRequestSteps.status, "pending"),
        sql`${approvalRequestSteps.stepOrder} < ${stepOrder}`
      )
    )
    .limit(1);

  if (earlierPendingSteps.length > 0) {
    throw new Error("Cannot approve this step: earlier steps are still pending");
  }

  // Verify approver is authorized for this step
  const [approver] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, approverId))
    .limit(1);

  if (!approver) {
    throw new Error("Approver not found");
  }

  // Check for self-approval: approver cannot approve their own request
  // For compensation_change and job_info_change, the affected employee is in entityId
  if (
    request.entityType === "compensation_change" ||
    request.entityType === "job_info_change"
  ) {
    if (request.entityId === approverId) {
      throw new Error("You cannot approve your own compensation or job information changes");
    }
  } else {
    // For other types (time_off), check requesterId
    if (request.requesterId === approverId) {
      throw new Error("You cannot approve your own requests");
    }
  }

  // Separation of duties: requester cannot give final approval
  // Check if this is the final step
  const totalSteps = await db
    .select()
    .from(approvalRequestSteps)
    .where(eq(approvalRequestSteps.approvalRequestId, approvalRequestId));
  
  const isFinalStep = stepOrder === Math.max(...totalSteps.map(s => s.stepOrder));
  
  if (isFinalStep && request.requesterId === approverId) {
    throw new Error("You cannot give final approval to a request you submitted");
  }

  // Check authorization: approver must be the assigned approver OR a full_admin for admin steps
  const isAssignedApprover = step.approverId === approverId;
  const isFullAdmin = approver.accessLevel === "full_admin";
  const isAdminStepWithFullAdmin = workflowStep.approverRole === "full_admin" && isFullAdmin;

  if (!isAssignedApprover && !isAdminStepWithFullAdmin) {
    throw new Error("You are not authorized to approve this step");
  }

  // Step status, entity updates, and audit logs commit together
  await db.transaction(async (tx) => {
    await tx
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

    await createAuditLog({
      employeeId: approverId,
      action: "approval_step_approved",
      entityType: request.entityType,
      entityId: request.entityId.toString(),
      changes: {
        approvalRequestId,
        stepOrder,
        entityType: request.entityType,
        comments,
      },
      tx,
    });

    const allSteps = await tx
      .select()
      .from(approvalRequestSteps)
      .where(eq(approvalRequestSteps.approvalRequestId, approvalRequestId))
      .orderBy(approvalRequestSteps.stepOrder);

    const allApproved = allSteps.every((s) => s.status === "approved");

    if (allApproved) {
      const [updatedRequest] = await tx
        .update(approvalRequests)
        .set({ status: "approved" })
        .where(eq(approvalRequests.id, approvalRequestId))
        .returning();

      if (updatedRequest.entityType === "time_off_request") {
        const [timeOffRequest] = await tx
          .select()
          .from(timeOffRequests)
          .where(eq(timeOffRequests.id, updatedRequest.entityId))
          .limit(1);

        if (!timeOffRequest) {
          throw new Error("Time off request not found");
        }

        const daysRequested = parseFloat(timeOffRequest.daysRequested);

        await tx
          .update(timeOffRequests)
          .set({
            status: "approved",
            reviewedBy: approverId,
            reviewedAt: new Date(),
          })
          .where(eq(timeOffRequests.id, updatedRequest.entityId));

        await tx
          .update(timeOffBalances)
          .set({
            balance: sql`${timeOffBalances.balance} - ${daysRequested}::numeric`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(timeOffBalances.employeeId, timeOffRequest.employeeId),
              eq(timeOffBalances.policyId, timeOffRequest.policyId)
            )
          );

        await createAuditLog({
          employeeId: approverId,
          action: "time_off_approved",
          entityType: "time_off_request",
          entityId: updatedRequest.entityId.toString(),
          changes: {
            approvalRequestId,
            stepOrder,
            daysRequested,
            policyId: timeOffRequest.policyId,
            comments,
          },
          tx,
        });
      } else if (updatedRequest.entityType === "timesheet") {
        await tx
          .update(timesheets)
          .set({
            status: "approved",
            reviewedBy: approverId,
            reviewedAt: new Date(),
          })
          .where(eq(timesheets.id, updatedRequest.entityId));
      } else if (updatedRequest.entityType === "compensation_change") {
        const metadata = updatedRequest.metadata as any;
        if (metadata) {
          await tx.insert(compensationHistory).values({
            employeeId: metadata.employeeId,
            effectiveDate: metadata.effectiveDate,
            payRate: metadata.payRate || "0",
            payType: metadata.payType,
            paySchedule: metadata.paySchedule,
            currency: metadata.currency || "CAD",
            changeReason: metadata.changeReason,
          });

          await createAuditLog({
            employeeId: approverId,
            action: "compensation_updated",
            entityType: "employee",
            entityId: metadata.employeeId.toString(),
            changes: {
              employeeId: metadata.employeeId,
              payRate: metadata.payRate,
              payType: metadata.payType,
              paySchedule: metadata.paySchedule,
              currency: metadata.currency,
              effectiveDate: metadata.effectiveDate,
              changeReason: metadata.changeReason,
              approvalRequestId: updatedRequest.id,
              approvedBy: approverId,
            },
            tx,
          });
        }
      } else if (updatedRequest.entityType === "job_info_change") {
        const metadata = updatedRequest.metadata as any;
        if (metadata) {
          const employeeUpdates: any = {
            updatedAt: new Date(),
          };

          if (metadata.jobTitle !== undefined) employeeUpdates.jobTitle = metadata.jobTitle;
          if (metadata.departmentId !== undefined) employeeUpdates.departmentId = metadata.departmentId;
          if (metadata.divisionId !== undefined) employeeUpdates.divisionId = metadata.divisionId;
          if (metadata.locationId !== undefined) employeeUpdates.locationId = metadata.locationId;
          if (metadata.managerId !== undefined) employeeUpdates.managerId = metadata.managerId;

          if (Object.keys(employeeUpdates).length > 1) {
            await tx
              .update(employees)
              .set(employeeUpdates)
              .where(eq(employees.id, metadata.employeeId));
          }

          await tx.insert(jobHistory).values({
            employeeId: metadata.employeeId,
            effectiveDate: metadata.effectiveDate,
            jobTitle: metadata.jobTitle || null,
            departmentId: metadata.departmentId || null,
            divisionId: metadata.divisionId || null,
            locationId: metadata.locationId || null,
            managerId: metadata.managerId || null,
            comment: metadata.changeReason || null,
          });

          await createAuditLog({
            employeeId: approverId,
            action: "job_info_updated",
            entityType: "employee",
            entityId: metadata.employeeId.toString(),
            changes: {
              employeeId: metadata.employeeId,
              jobTitle: metadata.jobTitle,
              departmentId: metadata.departmentId,
              divisionId: metadata.divisionId,
              locationId: metadata.locationId,
              managerId: metadata.managerId,
              effectiveDate: metadata.effectiveDate,
              changeReason: metadata.changeReason,
              approvalRequestId: updatedRequest.id,
              approvedBy: approverId,
            },
            tx,
          });
        }
      }
    } else {
      const currentStepIndex = allSteps.findIndex((s) => s.stepOrder === stepOrder);
      if (currentStepIndex !== -1 && currentStepIndex + 1 < allSteps.length) {
        const nextStepObj = allSteps[currentStepIndex + 1];

        await tx
          .update(approvalRequestSteps)
          .set({ status: "pending" })
          .where(
            and(
              eq(approvalRequestSteps.approvalRequestId, approvalRequestId),
              eq(approvalRequestSteps.stepOrder, nextStepObj.stepOrder)
            )
          );

        await tx
          .update(approvalRequests)
          .set({ currentStep: nextStepObj.stepOrder })
          .where(eq(approvalRequests.id, approvalRequestId));
      }
    }
  });
}

export async function rejectStep(
  approvalRequestId: number,
  stepOrder: number,
  approverId: number,
  comments?: string
) {
  // Fetch the step and request to verify authorization
  const [stepData] = await db
    .select({
      step: approvalRequestSteps,
      request: approvalRequests,
      workflowStep: approvalWorkflowSteps,
    })
    .from(approvalRequestSteps)
    .innerJoin(approvalRequests, eq(approvalRequestSteps.approvalRequestId, approvalRequests.id))
    .innerJoin(
      approvalWorkflowSteps,
      and(
        eq(approvalWorkflowSteps.workflowId, approvalRequests.workflowId),
        eq(approvalWorkflowSteps.stepOrder, approvalRequestSteps.stepOrder)
      )
    )
    .where(
      and(
        eq(approvalRequestSteps.approvalRequestId, approvalRequestId),
        eq(approvalRequestSteps.stepOrder, stepOrder)
      )
    )
    .limit(1);

  if (!stepData) {
    throw new Error("Approval step not found");
  }

  const { step, request, workflowStep } = stepData;

  if (step.status !== "pending") {
    throw new Error("Step has already been processed");
  }

  // Verify this is the current step (no earlier pending steps)
  const earlierPendingSteps = await db
    .select()
    .from(approvalRequestSteps)
    .where(
      and(
        eq(approvalRequestSteps.approvalRequestId, approvalRequestId),
        eq(approvalRequestSteps.status, "pending"),
        sql`${approvalRequestSteps.stepOrder} < ${stepOrder}`
      )
    )
    .limit(1);

  if (earlierPendingSteps.length > 0) {
    throw new Error("Cannot reject this step: earlier steps are still pending");
  }

  // Verify approver is authorized
  const [approver] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, approverId))
    .limit(1);

  if (!approver) {
    throw new Error("Approver not found");
  }

  // Separation of duties: requester cannot reject their own submitted request
  if (request.requesterId === approverId) {
    throw new Error("You cannot reject a request you submitted");
  }

  // Check authorization
  const isAssignedApprover = step.approverId === approverId;
  const isFullAdmin = approver.accessLevel === "full_admin";
  const isAdminStepWithFullAdmin = workflowStep.approverRole === "full_admin" && isFullAdmin;

  if (!isAssignedApprover && !isAdminStepWithFullAdmin) {
    throw new Error("You are not authorized to reject this step");
  }

  await db.transaction(async (tx) => {
    await tx
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

    await createAuditLog({
      employeeId: approverId,
      action: "approval_step_rejected",
      entityType: request.entityType,
      entityId: request.entityId.toString(),
      changes: {
        approvalRequestId,
        stepOrder,
        entityType: request.entityType,
        comments,
      },
      tx,
    });

    await tx
      .update(approvalRequests)
      .set({ status: "rejected" })
      .where(eq(approvalRequests.id, approvalRequestId));

    if (request.entityType === "time_off_request") {
      await tx
        .update(timeOffRequests)
        .set({
          status: "denied",
          reviewedBy: approverId,
          reviewedAt: new Date(),
          reviewNotes: comments,
        })
        .where(eq(timeOffRequests.id, request.entityId));
    } else if (request.entityType === "timesheet") {
      await tx
        .update(timesheets)
        .set({
          status: "rejected",
          reviewedBy: approverId,
          reviewedAt: new Date(),
          notes: comments,
        })
        .where(eq(timesheets.id, request.entityId));
    }
  });
}

/**
 * Pending approval steps visible on /approvals for this viewer.
 * Only the request's current step is returned, and blocked approvers are excluded.
 */
export async function getVisiblePendingApprovals(employeeId: number, isAdmin: boolean) {
  const pendingSteps = await db
    .select({
      step: approvalRequestSteps,
      request: approvalRequests,
      requester: employees,
    })
    .from(approvalRequestSteps)
    .innerJoin(
      approvalRequests,
      eq(approvalRequestSteps.approvalRequestId, approvalRequests.id)
    )
    .innerJoin(employees, eq(approvalRequests.requesterId, employees.id))
    .where(
      and(
        eq(approvalRequestSteps.status, "pending"),
        eq(approvalRequests.status, "pending"),
        eq(approvalRequestSteps.stepOrder, approvalRequests.currentStep),
        or(
          eq(approvalRequestSteps.approverId, employeeId),
          and(
            isNull(approvalRequestSteps.approverId),
            isAdmin ? sql`true` : sql`false`
          )
        )
      )
    )
    .orderBy(approvalRequests.createdAt);

  if (pendingSteps.length === 0) {
    return [];
  }

  const requestIds = pendingSteps.map((item) => item.request.id);
  const allSteps = await db
    .select({
      approvalRequestId: approvalRequestSteps.approvalRequestId,
      stepOrder: approvalRequestSteps.stepOrder,
    })
    .from(approvalRequestSteps)
    .where(inArray(approvalRequestSteps.approvalRequestId, requestIds));

  const maxStepByRequest = new Map<number, number>();
  for (const s of allSteps) {
    const current = maxStepByRequest.get(s.approvalRequestId) ?? 0;
    if (s.stepOrder > current) {
      maxStepByRequest.set(s.approvalRequestId, s.stepOrder);
    }
  }

  return pendingSteps.filter((item) => {
    const maxStep = maxStepByRequest.get(item.request.id) ?? item.step.stepOrder;
    return !isApproverBlockedFromActing({
      entityType: item.request.entityType,
      entityId: item.request.entityId,
      requesterId: item.request.requesterId,
      viewerId: employeeId,
      isFinalStep: item.step.stepOrder === maxStep,
    });
  });
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
