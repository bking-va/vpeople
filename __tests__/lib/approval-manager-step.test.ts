import {
  canActOnApprovalStep,
  resolveManagerRoleStep,
} from "@/lib/approval-manager-step";

describe("resolveManagerRoleStep", () => {
  it("assigns the manager when one exists", () => {
    expect(
      resolveManagerRoleStep({
        role: "manager",
        managerId: 42,
      })
    ).toEqual({ approverId: 42, status: "pending" });
  });

  it("auto-approves only when the employee is intentionally managerless", () => {
    expect(
      resolveManagerRoleStep({
        role: "manager",
        managerId: null,
      })
    ).toEqual({ approverId: null, status: "approved" });
  });

  it("keeps manager steps pending when a replacement supervisor is unresolved", () => {
    expect(
      resolveManagerRoleStep({
        role: "manager",
        managerId: null,
        pendingSupervisorBambooId: "200",
      })
    ).toEqual({ approverId: null, status: "pending" });
  });

  it("never auto-approves manager_manager while a supervisor is unresolved", () => {
    expect(
      resolveManagerRoleStep({
        role: "manager_manager",
        managerId: null,
        skipLevelManagerId: 9,
        pendingSupervisorBambooId: "200",
      })
    ).toEqual({ approverId: null, status: "pending" });
  });

  it("assigns skip-level when the supervisor is known", () => {
    expect(
      resolveManagerRoleStep({
        role: "manager_manager",
        managerId: 42,
        skipLevelManagerId: 9,
      })
    ).toEqual({ approverId: 9, status: "pending" });
  });
});

describe("canActOnApprovalStep", () => {
  it("lets the assigned manager act", () => {
    expect(
      canActOnApprovalStep({
        assignedApproverId: 42,
        actorId: 42,
        actorAccessLevel: "employee",
        approverRole: "manager",
      })
    ).toBe(true);
  });

  it("does not let a full_admin skip an assigned manager step", () => {
    expect(
      canActOnApprovalStep({
        assignedApproverId: 42,
        actorId: 1,
        actorAccessLevel: "full_admin",
        approverRole: "manager",
      })
    ).toBe(false);
  });

  it("lets a full_admin act on unresolved manager steps with no assigned approver", () => {
    expect(
      canActOnApprovalStep({
        assignedApproverId: null,
        actorId: 1,
        actorAccessLevel: "full_admin",
        approverRole: "manager",
      })
    ).toBe(true);
  });

  it("does not let a non-admin act on unresolved manager steps", () => {
    expect(
      canActOnApprovalStep({
        assignedApproverId: null,
        actorId: 7,
        actorAccessLevel: "employee",
        approverRole: "manager",
      })
    ).toBe(false);
  });
});
