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
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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
    } else if (request.entityType === "compensation_change") {
      // Apply compensation change from metadata
      const metadata = request.metadata as any;
      if (metadata) {
        await db.insert(compensationHistory).values({
          employeeId: metadata.employeeId,
          effectiveDate: metadata.effectiveDate,
          payRate: metadata.payRate || "0",
          payType: metadata.payType,
          paySchedule: metadata.paySchedule,
          currency: metadata.currency || "CAD",
          changeReason: metadata.changeReason,
        });
      }
    } else if (request.entityType === "job_info_change") {
      // Apply job info change from metadata
      const metadata = request.metadata as any;
      if (metadata) {
        // Update employee record
        if (metadata.employeeUpdates) {
          await db
            .update(employees)
            .set({
              ...metadata.employeeUpdates,
              updatedAt: new Date(),
            })
            .where(eq(employees.id, metadata.employeeId));
        }
        
        // Record in job history (only fields that exist in job_history schema)
        await db.insert(jobHistory).values({
          employeeId: metadata.employeeId,
          effectiveDate: metadata.effectiveDate,
          jobTitle: metadata.jobTitle,
          departmentId: metadata.departmentId,
          divisionId: metadata.divisionId,
          locationId: metadata.locationId,
          managerId: metadata.managerId,
          comment: metadata.changeReason,
        });
      }
    }
  } else {
    // Move to next step
    const currentStepIndex = allSteps.findIndex((s) => s.stepOrder === stepOrder);
    if (currentStepIndex !== -1 && currentStepIndex + 1 < allSteps.length) {
      const nextStepObj = allSteps[currentStepIndex + 1];
      
      // Mark next step as pending
      await db
        .update(approvalRequestSteps)
        .set({ status: "pending" })
        .where(
          and(
            eq(approvalRequestSteps.approvalRequestId, approvalRequestId),
            eq(approvalRequestSteps.stepOrder, nextStepObj.stepOrder)
          )
        );

      // Update request current step
      await db
        .update(approvalRequests)
        .set({ currentStep: nextStepObj.stepOrder })
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
