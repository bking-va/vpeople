export type ManagerRole = "manager" | "manager_manager";

export type ManagerRoleStepResolution = {
  approverId: number | null;
  status: "pending" | "approved";
};

export function hasUnresolvedSupervisor(
  pendingSupervisorBambooId?: string | null
): boolean {
  return Boolean(pendingSupervisorBambooId && pendingSupervisorBambooId.trim());
}

/**
 * Intentionally managerless employees (CEO) auto-approve manager-role steps.
 * An unresolved Bamboo replacement supervisor is not managerless: keep the
 * step pending and never auto-approve it.
 */
export function resolveManagerRoleStep(opts: {
  role: ManagerRole;
  managerId: number | null | undefined;
  skipLevelManagerId?: number | null;
  pendingSupervisorBambooId?: string | null;
}): ManagerRoleStepResolution {
  if (hasUnresolvedSupervisor(opts.pendingSupervisorBambooId)) {
    return { approverId: null, status: "pending" };
  }
  if (opts.role === "manager") {
    if (opts.managerId) {
      return { approverId: opts.managerId, status: "pending" };
    }
    return { approverId: null, status: "approved" };
  }
  if (opts.skipLevelManagerId) {
    return { approverId: opts.skipLevelManagerId, status: "pending" };
  }
  return { approverId: null, status: "approved" };
}

export function canActOnApprovalStep(opts: {
  assignedApproverId: number | null;
  actorId: number;
  actorAccessLevel: string;
  approverRole: string;
}): boolean {
  if (opts.assignedApproverId === opts.actorId) return true;
  const isFullAdmin = opts.actorAccessLevel === "full_admin";
  if (opts.approverRole === "full_admin" && isFullAdmin) return true;
  const isManagerRole =
    opts.approverRole === "manager" || opts.approverRole === "manager_manager";
  // Unresolved-supervisor fallback: no assigned manager, full_admin/HR may act.
  if (isManagerRole && opts.assignedApproverId == null && isFullAdmin) {
    return true;
  }
  return false;
}
