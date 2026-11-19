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
  employmentStatusHistory,
} from "@/lib/db/schema";
import { eq, and, or, sql, inArray, isNull } from "drizzle-orm";
import { createAuditLog } from "@/lib/audit";
import { isApproverBlockedFromActing } from "@/lib/approval-errors";
import {
  canActOnApprovalStep,
  hasUnresolvedSupervisor,
  resolveManagerRoleStep,
} from "@/lib/approval-manager-step";
import { recordTimeOffUsageAdjustment } from "@/lib/time-off-adjustments";

export { isApproverBlockedFromActing } from "@/lib/approval-errors";

export type ApprovalEntityType =
  | "time_off_request"
  | "timesheet"
  | "compensation_change"
  | "job_info_change"
  | "employment_status_change"
  | "promotion";

export interface CreateApprovalRequestParams {
  workflowId: number;
  entityType: ApprovalEntityType;
  entityId: number;
  requesterId: number;
  metadata?: any;
}

const AFFECTED_EMPLOYEE_ENTITY_TYPES: ApprovalEntityType[] = [
  "compensation_change",
  "job_info_change",
  "employment_status_change",
  "promotion",
];

function isAffectedEmployeeEntityType(entityType: string): boolean {
  return AFFECTED_EMPLOYEE_ENTITY_TYPES.includes(entityType as ApprovalEntityType);
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

  const employeeManagerFields = {
    id: employees.id,
    managerId: employees.managerId,
    pendingSupervisorBambooId: employees.pendingSupervisorBambooId,
  };

  // Fetch requester to determine manager — never pull SIN/SSN/compensation.
  const [requester] = await db
    .select(employeeManagerFields)
    .from(employees)
    .where(eq(employees.id, requesterId))
    .limit(1);

  if (!requester) {
    throw new Error("Requester not found");
  }

  // For employee-affecting changes, fetch the affected employee
  let affectedEmployee = requester;
  if (isAffectedEmployeeEntityType(entityType)) {
    const [affected] = await db
      .select(employeeManagerFields)
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
    if (step.approverRole === "manager" || step.approverRole === "manager_manager") {
      let skipLevelManagerId: number | null | undefined;
      if (
        step.approverRole === "manager_manager" &&
        affectedEmployee.managerId &&
        !hasUnresolvedSupervisor(affectedEmployee.pendingSupervisorBambooId)
      ) {
        const [manager] = await db
          .select({ managerId: employees.managerId })
          .from(employees)
          .where(eq(employees.id, affectedEmployee.managerId))
          .limit(1);
        skipLevelManagerId = manager?.managerId ?? null;
      }
      const resolved = resolveManagerRoleStep({
        role: step.approverRole,
        managerId: affectedEmployee.managerId,
        skipLevelManagerId,
        pendingSupervisorBambooId: affectedEmployee.pendingSupervisorBambooId,
      });
      approverId = resolved.approverId;
      stepStatus = resolved.status;
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
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, approverId))
    .limit(1);

  if (!approver) {
    throw new Error("Approver not found");
  }

  // Check for self-approval: approver cannot approve their own request
  // For employee-affecting changes, the affected employee is in entityId
  if (isAffectedEmployeeEntityType(request.entityType)) {
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

  if (
    !canActOnApprovalStep({
      assignedApproverId: step.approverId,
      actorId: approverId,
      actorAccessLevel: approver.accessLevel,
      approverRole: workflowStep.approverRole,
    })
  ) {
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

        await recordTimeOffUsageAdjustment(tx, {
          employeeId: timeOffRequest.employeeId,
          policyId: timeOffRequest.policyId,
          daysRequested,
          requestId: updatedRequest.entityId,
          adjustedBy: approverId,
        });

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
          const nextStatus =
            metadata.employmentStatus || metadata.employeeUpdates?.employmentStatus;
          if (nextStatus !== undefined) employeeUpdates.employmentStatus = nextStatus;

          const [previous] = await tx
            .select({ employmentStatus: employees.employmentStatus })
            .from(employees)
            .where(eq(employees.id, metadata.employeeId))
            .limit(1);

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
            employmentStatus: nextStatus || null,
            comment: metadata.changeReason || null,
          });

          if (nextStatus && previous?.employmentStatus !== nextStatus) {
            await tx.insert(employmentStatusHistory).values({
              employeeId: metadata.employeeId,
              effectiveDate: metadata.effectiveDate,
              status: nextStatus,
              changeType: "status_change",
              comment: metadata.changeReason || "Job info update",
              recordedById: approverId,
            });
          }

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
      } else if (updatedRequest.entityType === "employment_status_change") {
        const metadata = updatedRequest.metadata as any;
        if (metadata?.status) {
          await tx
            .update(employees)
            .set({
              employmentStatus: metadata.status,
              updatedAt: new Date(),
            })
            .where(eq(employees.id, metadata.employeeId));

          await tx.insert(employmentStatusHistory).values({
            employeeId: metadata.employeeId,
            effectiveDate: metadata.effectiveDate,
            status: metadata.status,
            changeType: "status_change",
            comment: metadata.changeReason || "Employment status change",
            recordedById: approverId,
          });

          await createAuditLog({
            employeeId: approverId,
            action: "employment_status_updated",
            entityType: "employee",
            entityId: metadata.employeeId.toString(),
            changes: {
              employeeId: metadata.employeeId,
              status: metadata.status,
              effectiveDate: metadata.effectiveDate,
              changeReason: metadata.changeReason,
              approvalRequestId: updatedRequest.id,
              approvedBy: approverId,
            },
            tx,
          });
        }
      } else if (updatedRequest.entityType === "promotion") {
        const metadata = updatedRequest.metadata as any;
        if (metadata) {
          const [previous] = await tx
            .select({ employmentStatus: employees.employmentStatus })
            .from(employees)
            .where(eq(employees.id, metadata.employeeId))
            .limit(1);
          const nextStatus = metadata.employmentStatus || previous?.employmentStatus || "full_time";

          const employeeUpdates: Record<string, unknown> = { updatedAt: new Date() };
          if (metadata.jobTitle !== undefined) employeeUpdates.jobTitle = metadata.jobTitle;
          if (metadata.departmentId !== undefined) employeeUpdates.departmentId = metadata.departmentId;
          if (metadata.jobLevelId !== undefined) employeeUpdates.jobLevelId = metadata.jobLevelId;
          if (metadata.jobFamilyId !== undefined) employeeUpdates.jobFamilyId = metadata.jobFamilyId;
          if (metadata.managerId !== undefined) employeeUpdates.managerId = metadata.managerId;

          await tx
            .update(employees)
            .set(employeeUpdates)
            .where(eq(employees.id, metadata.employeeId));

          await tx.insert(jobHistory).values({
            employeeId: metadata.employeeId,
            effectiveDate: metadata.effectiveDate,
            jobTitle: metadata.jobTitle || null,
            departmentId: metadata.departmentId || null,
            divisionId: metadata.divisionId || null,
            locationId: metadata.locationId || null,
            managerId: metadata.managerId || null,
            employmentStatus: nextStatus,
            comment: metadata.changeReason || "Promotion",
          });

          await tx.insert(employmentStatusHistory).values({
            employeeId: metadata.employeeId,
            effectiveDate: metadata.effectiveDate,
            status: nextStatus,
            changeType: "promotion",
            comment: metadata.changeReason || "Promotion",
            recordedById: approverId,
          });

          await createAuditLog({
            employeeId: approverId,
            action: "employee_promoted",
            entityType: "employee",
            entityId: metadata.employeeId.toString(),
            changes: {
              employeeId: metadata.employeeId,
              jobTitle: metadata.jobTitle,
              departmentId: metadata.departmentId,
              jobLevelId: metadata.jobLevelId,
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
    .select({ id: employees.id, accessLevel: employees.accessLevel })
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

  if (
    !canActOnApprovalStep({
      assignedApproverId: step.approverId,
      actorId: approverId,
      actorAccessLevel: approver.accessLevel,
      approverRole: workflowStep.approverRole,
    })
  ) {
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
      approver: {
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
      },
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

const MANAGER_ROLE_STEP_ROLES = ["manager", "manager_manager"] as const;
const REQUESTER_OWNED_ENTITY_TYPES = ["time_off_request", "timesheet"] as const;

/** Drizzle connection or transaction used for manager-step rebinding. */
export type ApprovalQueryExecutor = {
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

function chunkIds(ids: readonly number[], size = 500): number[][] {
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

function employeeIdForManagerStep(request: {
  entityType: string;
  entityId: number;
  requesterId: number;
}): number | null {
  if (
    (REQUESTER_OWNED_ENTITY_TYPES as readonly string[]).includes(request.entityType)
  ) {
    return request.requesterId;
  }
  if (
    (AFFECTED_EMPLOYEE_ENTITY_TYPES as readonly string[]).includes(request.entityType)
  ) {
    return request.entityId;
  }
  return null;
}

async function pendingManagerRoleStepsForEmployees(
  employeeIds: number[],
  executor: ApprovalQueryExecutor
) {
  if (employeeIds.length === 0) return [];
  const rows: Array<{
    step: { id: number };
    request: {
      entityType: string;
      entityId: number;
      requesterId: number;
    };
    workflowStep: { approverRole: string | null };
  }> = [];
  for (const ids of chunkIds(employeeIds)) {
    const chunk = await executor
      .select({
        step: approvalRequestSteps,
        request: approvalRequests,
        workflowStep: approvalWorkflowSteps,
      })
      .from(approvalRequestSteps)
      .innerJoin(
        approvalRequests,
        eq(approvalRequestSteps.approvalRequestId, approvalRequests.id)
      )
      .innerJoin(
        approvalWorkflowSteps,
        and(
          eq(approvalWorkflowSteps.workflowId, approvalRequests.workflowId),
          eq(approvalWorkflowSteps.stepOrder, approvalRequestSteps.stepOrder)
        )
      )
      .where(
        and(
          eq(approvalRequests.status, "pending"),
          eq(approvalRequestSteps.status, "pending"),
          inArray(approvalWorkflowSteps.approverRole, [...MANAGER_ROLE_STEP_ROLES]),
          or(
            and(
              inArray(approvalRequests.entityType, [...REQUESTER_OWNED_ENTITY_TYPES]),
              inArray(approvalRequests.requesterId, ids)
            ),
            and(
              inArray(approvalRequests.entityType, AFFECTED_EMPLOYEE_ENTITY_TYPES),
              inArray(approvalRequests.entityId, ids)
            )
          )
        )
      );
    rows.push(...chunk);
  }
  return rows;
}

async function updateApproverIds(
  executor: ApprovalQueryExecutor,
  updates: Array<{ stepId: number; approverId: number | null }>
) {
  const byApprover = new Map<number | "null", number[]>();
  for (const update of updates) {
    const key = update.approverId ?? "null";
    const ids = byApprover.get(key) ?? [];
    ids.push(update.stepId);
    byApprover.set(key, ids);
  }
  for (const [key, stepIds] of byApprover) {
    const approverId = key === "null" ? null : key;
    for (const ids of chunkIds(stepIds)) {
      await executor
        .update(approvalRequestSteps)
        .set({ approverId })
        .where(inArray(approvalRequestSteps.id, ids));
    }
  }
}

/** Drop the former manager from still-pending manager-role steps. Never auto-approve. */
export async function unassignPendingManagerApprovalsMany(
  employeeIds: number[],
  executor: ApprovalQueryExecutor = db
) {
  const uniqueIds = [...new Set(employeeIds)];
  const rows = await pendingManagerRoleStepsForEmployees(uniqueIds, executor);
  if (rows.length === 0) return;
  await updateApproverIds(
    executor,
    rows.map((row) => ({ stepId: row.step.id, approverId: null }))
  );
}

export async function unassignPendingManagerApprovals(
  employeeId: number,
  executor: ApprovalQueryExecutor = db
) {
  await unassignPendingManagerApprovalsMany([employeeId], executor);
}

/** Point still-pending manager-role steps at the newly resolved supervisor. */
export async function rebindPendingManagerApprovalsMany(
  links: Array<{ employeeId: number; managerId: number }>,
  executor: ApprovalQueryExecutor = db
) {
  if (links.length === 0) return;
  const byEmployee = new Map<number, number>();
  for (const link of links) {
    byEmployee.set(link.employeeId, link.managerId);
  }
  const employeeIds = [...byEmployee.keys()];
  const rows = await pendingManagerRoleStepsForEmployees(employeeIds, executor);
  if (rows.length === 0) return;

  const managerIds = [...new Set(byEmployee.values())];
  const skipLevel = new Map<number, number | null>();
  for (const ids of chunkIds(managerIds)) {
    const managers: Array<{ id: number; managerId: number | null }> = await executor
      .select({ id: employees.id, managerId: employees.managerId })
      .from(employees)
      .where(inArray(employees.id, ids));
    for (const manager of managers) {
      skipLevel.set(manager.id, manager.managerId ?? null);
    }
  }

  const updates: Array<{ stepId: number; approverId: number | null }> = [];
  for (const row of rows) {
    const role = row.workflowStep.approverRole;
    if (role !== "manager" && role !== "manager_manager") continue;
    const employeeId = employeeIdForManagerStep(row.request);
    if (employeeId == null) continue;
    const managerId = byEmployee.get(employeeId);
    if (managerId == null) continue;
    const nextApproverId =
      role === "manager" ? managerId : skipLevel.get(managerId) ?? null;
    updates.push({ stepId: row.step.id, approverId: nextApproverId });
  }
  await updateApproverIds(executor, updates);
}

export async function rebindPendingManagerApprovals(
  employeeId: number,
  managerId: number,
  executor: ApprovalQueryExecutor = db
) {
  await rebindPendingManagerApprovalsMany([{ employeeId, managerId }], executor);
}
