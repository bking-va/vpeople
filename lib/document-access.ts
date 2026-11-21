import { isFullAdmin, type AccessLevel } from "@/lib/authz";

export function canViewEmployeeDocument(opts: {
  viewerId: number;
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
  document: {
    employeeId: number;
    restricted: boolean;
    containsCompensation: boolean;
  };
}): boolean {
  const isOwner = opts.viewerId === opts.document.employeeId;
  const isHr =
    isFullAdmin(opts.accessLevel) || opts.canManageUsers === true;
  if (opts.document.restricted || opts.document.containsCompensation) {
    return isHr || isOwner;
  }
  return isHr || isOwner;
}

export function canViewCompanyFile(opts: {
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
  file: { restricted: boolean; containsCompensation: boolean };
}): boolean {
  const isHr =
    isFullAdmin(opts.accessLevel) || opts.canManageUsers === true;
  if (opts.file.restricted || opts.file.containsCompensation) {
    return isHr;
  }
  return isHr || Boolean(opts.accessLevel);
}
