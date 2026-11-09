/**
 * True when this viewer must not see or act on the step:
 * - cannot approve their own compensation/job change (affected employee)
 * - cannot approve their own time-off / timesheet request
 * - cannot give final approval to a request they submitted
 */
export function isApproverBlockedFromActing(opts: {
  entityType: string;
  entityId: number;
  requesterId: number;
  viewerId: number;
  isFinalStep: boolean;
}): boolean {
  const { entityType, entityId, requesterId, viewerId, isFinalStep } = opts;

  if (
    entityType === "compensation_change" ||
    entityType === "job_info_change" ||
    entityType === "employment_status_change" ||
    entityType === "promotion"
  ) {
    if (entityId === viewerId) return true;
  } else if (requesterId === viewerId) {
    return true;
  }

  if (isFinalStep && requesterId === viewerId) return true;
  return false;
}

/**
 * Map approval engine errors to HTTP status codes.
 * 409 = step already processed (conflict)
 * 403 = authorization / policy refusals
 * 500 = unexpected
 */
export function httpStatusForApprovalError(message: string | undefined): number {
  const msg = message || "";

  if (msg.includes("already been processed")) {
    return 409;
  }

  if (
    msg.includes("not authorized") ||
    msg.includes("cannot approve") ||
    msg.includes("cannot reject") ||
    msg.includes("cannot give final") ||
    msg.includes("earlier steps are still pending") ||
    msg.includes("your own") ||
    msg.includes("you submitted")
  ) {
    return 403;
  }

  return 500;
}
