import { httpStatusForApprovalError } from "@/lib/approval-errors";

describe("httpStatusForApprovalError", () => {
  test("returns 409 for already processed steps", () => {
    expect(httpStatusForApprovalError("Step has already been processed")).toBe(409);
  });

  test("returns 403 for authorization refusals", () => {
    expect(httpStatusForApprovalError("You are not authorized to approve this step")).toBe(403);
    expect(httpStatusForApprovalError("You cannot approve your own compensation or job information changes")).toBe(403);
    expect(httpStatusForApprovalError("You cannot give final approval to a request you submitted")).toBe(403);
    expect(httpStatusForApprovalError("You cannot reject a request you submitted")).toBe(403);
    expect(httpStatusForApprovalError("Cannot approve this step: earlier steps are still pending")).toBe(403);
  });

  test("returns 500 for unexpected errors", () => {
    expect(httpStatusForApprovalError("Time off request not found")).toBe(500);
    expect(httpStatusForApprovalError(undefined)).toBe(500);
  });
});
