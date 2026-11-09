import { db } from "@/lib/db";
import {
  approvalWorkflows,
  approvalWorkflowSteps,
  timeOffRequests,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createApprovalRequest } from "@/lib/approvals";

/** First enabled time-off workflow that actually has steps. */
export async function findConfiguredTimeOffWorkflow() {
  const workflows = await db
    .select()
    .from(approvalWorkflows)
    .where(
      and(
        eq(approvalWorkflows.type, "time_off"),
        eq(approvalWorkflows.enabled, true)
      )
    )
    .orderBy(approvalWorkflows.id);

  for (const workflow of workflows) {
    const [step] = await db
      .select({ id: approvalWorkflowSteps.id })
      .from(approvalWorkflowSteps)
      .where(eq(approvalWorkflowSteps.workflowId, workflow.id))
      .limit(1);
    if (step) return workflow;
  }
  return null;
}

/**
 * Attach the configured multi-step time-off engine to a newly created request.
 * Throws if a workflow exists but approval rows cannot be created — callers
 * must not leave a pending request that the legacy action could fully approve.
 */
export async function attachConfiguredTimeOffApproval(opts: {
  timeOffRequestId: number;
  requesterId: number;
}) {
  const workflow = await findConfiguredTimeOffWorkflow();
  if (!workflow) return null;

  await db
    .update(timeOffRequests)
    .set({ workflowId: workflow.id })
    .where(eq(timeOffRequests.id, opts.timeOffRequestId));

  const result = await createApprovalRequest({
    workflowId: workflow.id,
    entityType: "time_off_request",
    entityId: opts.timeOffRequestId,
    requesterId: opts.requesterId,
  });
  if (!result.success) {
    throw new Error(result.error || "Failed to create approval request");
  }
  return workflow;
}
