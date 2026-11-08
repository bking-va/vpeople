import { isApproverBlockedFromActing } from "@/lib/approval-errors";

describe("isApproverBlockedFromActing", () => {
  test("blocks the affected employee from their own compensation change", () => {
    expect(
      isApproverBlockedFromActing({
        entityType: "compensation_change",
        entityId: 10,
        requesterId: 2,
        viewerId: 10,
        isFinalStep: true,
      })
    ).toBe(true);
  });

  test("blocks the requester from giving final approval", () => {
    expect(
      isApproverBlockedFromActing({
        entityType: "compensation_change",
        entityId: 10,
        requesterId: 2,
        viewerId: 2,
        isFinalStep: true,
      })
    ).toBe(true);
  });

  test("allows a different admin on the final compensation step", () => {
    expect(
      isApproverBlockedFromActing({
        entityType: "compensation_change",
        entityId: 10,
        requesterId: 2,
        viewerId: 3,
        isFinalStep: true,
      })
    ).toBe(false);
  });

  test("blocks a time-off requester from acting on their own request", () => {
    expect(
      isApproverBlockedFromActing({
        entityType: "time_off_request",
        entityId: 99,
        requesterId: 5,
        viewerId: 5,
        isFinalStep: false,
      })
    ).toBe(true);
  });
});
