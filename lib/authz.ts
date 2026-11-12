import { createHash, timingSafeEqual } from "crypto";

export type AccessLevel =
  | "employee"
  | "manager"
  | "regional_view"
  | "global_view"
  | "full_admin"
  | string
  | null
  | undefined;

export function isFullAdmin(accessLevel: AccessLevel, sessionRole?: string | null) {
  return accessLevel === "full_admin" || sessionRole === "full_admin";
}

export function isViewingAccessLevel(accessLevel: AccessLevel) {
  return accessLevel === "global_view" || accessLevel === "regional_view";
}

export function isManagerAccessLevel(accessLevel: AccessLevel) {
  return accessLevel === "manager";
}

/** Settings catalog writes: full_admin only. Viewing roles mapped to session "admin" must not write. */
export function canWriteSettings(accessLevel: AccessLevel, sessionRole?: string | null) {
  return isFullAdmin(accessLevel, sessionRole);
}

/** Hiring mutations: HR (canManageUsers) or full_admin. */
export function canManageHiring(opts: {
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
  isHiringLead?: boolean;
}) {
  return (
    isFullAdmin(opts.accessLevel) ||
    opts.canManageUsers === true ||
    opts.isHiringLead === true
  );
}

export function canViewImmigrationNumbers(opts: {
  isViewingSelf: boolean;
  canViewSensitivePersonalInfo: boolean;
}) {
  return opts.isViewingSelf || opts.canViewSensitivePersonalInfo;
}

/** ROE codes, termination reasons, and termination type: self or sensitive-HR only. */
export function canViewTerminationDetails(opts: {
  isViewingSelf: boolean;
  canViewSensitivePersonalInfo: boolean;
}) {
  return opts.isViewingSelf || opts.canViewSensitivePersonalInfo === true;
}

/** Fail closed: treat status_change rows that look like terminations as terminations. */
export function isTerminationHistoryRow(row: {
  changeType?: string | null;
  status?: string | null;
  employmentStatus?: string | null;
  terminationReasonId?: number | string | null;
  terminationReason?: string | null;
  terminationType?: string | null;
  roeCode?: string | null;
}): boolean {
  const status = row.status ?? row.employmentStatus;
  return (
    row.changeType === "terminate" ||
    status === "terminated" ||
    row.terminationReasonId != null ||
    Boolean(row.terminationReason) ||
    Boolean(row.terminationType) ||
    Boolean(row.roeCode)
  );
}

export function redactTerminationDetails<
  T extends {
    roeCode?: string | null;
    terminationType?: string | null;
    terminationReasonId?: number | string | null;
    terminationReason?: string | null;
    terminationTypeId?: string | null;
    comment?: string | null;
    changeType?: string | null;
    status?: string | null;
    employmentStatus?: string | null;
  },
>(row: T, allowed: boolean): T {
  if (allowed) return row;
  const hideComment =
    Object.prototype.hasOwnProperty.call(row, "comment") && isTerminationHistoryRow(row);
  return {
    ...row,
    ...(Object.prototype.hasOwnProperty.call(row, "roeCode") ? { roeCode: null } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "terminationType")
      ? { terminationType: null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "terminationReasonId")
      ? { terminationReasonId: null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "terminationReason")
      ? { terminationReason: null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "terminationTypeId")
      ? { terminationTypeId: null }
      : {}),
    ...(hideComment ? { comment: null } : {}),
  } as T;
}

export const VENDASTA_WORK_EMAIL_DOMAIN = "vendasta.com";

/** Work emails @vendasta.com are directory-visible. Any other address is personal. */
export function isVendastaWorkEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return false;
  return trimmed.slice(at + 1).toLowerCase() === VENDASTA_WORK_EMAIL_DOMAIN;
}

/** Personal (non-@vendasta.com) emails: self or HR with sensitive-PII access. Not coworkers or unrelated managers. */
export function canViewPersonalEmail(opts: {
  isViewingSelf: boolean;
  canViewSensitivePersonalInfo: boolean;
}) {
  return opts.isViewingSelf || opts.canViewSensitivePersonalInfo === true;
}

/**
 * Directory / list / API-key directory exports: work emails stay visible;
 * personal addresses only on the viewer's own row.
 */
export function visibleDirectoryEmail(
  email: string | null | undefined,
  opts: { isSelf: boolean }
): string | null {
  if (!email) return email ?? null;
  if (isVendastaWorkEmail(email)) return email;
  return opts.isSelf ? email : null;
}

/** Profile / single-employee: work emails always; personal only for self or authorized HR. */
export function visibleProfileEmail(
  email: string | null | undefined,
  opts: { isViewingSelf: boolean; canViewSensitivePersonalInfo: boolean }
): string | null {
  if (!email) return email ?? null;
  if (isVendastaWorkEmail(email)) return email;
  return canViewPersonalEmail(opts) ? email : null;
}

export function canViewPrivateDocuments(opts: {
  isViewingSelf: boolean;
  canManageUsers: boolean;
  accessLevel: AccessLevel;
}) {
  return opts.isViewingSelf || opts.canManageUsers || isFullAdmin(opts.accessLevel);
}

/** Accrual/usage ledger: self, their manager, HR, or full_admin — not coworkers or viewing roles. */
export function canViewTimeOffLedger(opts: {
  isViewingSelf: boolean;
  isManager: boolean;
  canManageUsers: boolean;
  accessLevel: AccessLevel;
}) {
  return (
    opts.isViewingSelf ||
    opts.isManager ||
    opts.canManageUsers ||
    isFullAdmin(opts.accessLevel)
  );
}

/** Manual balance adjustments and holiday writes: HR (canManageUsers) or full_admin. */
export function canManageTimeOffOperations(opts: {
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
}) {
  return isFullAdmin(opts.accessLevel) || opts.canManageUsers === true;
}

export function canViewOfferSalary(opts: {
  canViewCompensation: boolean;
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
}) {
  return opts.canViewCompensation || isFullAdmin(opts.accessLevel) || opts.canManageUsers === true;
}

/** Compensation-bearing letter bodies: recipient or canViewCompensation. canManageUsers is not enough. */
export function canViewIssuedLetterBody(opts: {
  isRecipient: boolean;
  containsCompensation: boolean;
  canViewCompensation: boolean;
}) {
  if (opts.isRecipient) return true;
  if (!opts.containsCompensation) return true;
  return opts.canViewCompensation === true;
}

export function redactVisaDocumentNumber<T extends { documentNumber?: string | null }>(
  row: T,
  allowed: boolean
): T {
  if (allowed) return row;
  return { ...row, documentNumber: null };
}

export function safeApproverPreview(approver: {
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!approver) return null;
  return {
    firstName: approver.firstName || "",
    lastName: approver.lastName || "",
  };
}

export function clampCandidateRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * App session.role from vPeople accessLevel only.
 * Viewing roles stay "employee" so they cannot pass session.role admin write
 * gates. Never derive this from IdP claims, roles[], or user input.
 */
export function sessionRoleFromAccessLevel(
  accessLevel: AccessLevel
): "employee" | "manager" | "admin" | "full_admin" {
  if (accessLevel === "manager") return "manager";
  if (accessLevel === "full_admin") return "full_admin";
  return "employee";
}

export function isDevLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ENABLE_DEV_AUTH !== "true") return false;
  const isProd = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  if (isProd && env.ALLOW_DEV_AUTH_IN_PRODUCTION !== "true") return false;
  return true;
}

/** Separate from enabling the form: an email lookup must not become full_admin. */
export function isDevAdminImpersonationEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isDevLoginEnabled(env) && env.ALLOW_DEV_ADMIN_IMPERSONATION === "true";
}

/**
 * Dev login session role from an email's employee row. Viewing roles stay
 * "employee". full_admin requires ALLOW_DEV_ADMIN_IMPERSONATION.
 */
export function devLoginSessionRole(
  accessLevel: AccessLevel,
  env: NodeJS.ProcessEnv = process.env
): "employee" | "manager" | "full_admin" {
  if (accessLevel === "manager") return "manager";
  if (accessLevel === "full_admin" && isDevAdminImpersonationEnabled(env)) {
    return "full_admin";
  }
  return "employee";
}

/**
 * Email-only dev login may bind a matching employee-level row.
 * Privileged identities (full_admin, HR flags, viewing roles) require
 * ALLOW_DEV_ADMIN_IMPERSONATION. Does not enable that flag.
 */
export function isPrivilegedDevLoginIdentity(opts: {
  accessLevel?: AccessLevel;
  canManageUsers?: boolean | null;
  canViewCompensation?: boolean | null;
  canViewSensitivePersonalInfo?: boolean | null;
}): boolean {
  const accessLevel = opts.accessLevel;
  if (
    accessLevel === "full_admin" ||
    accessLevel === "global_view" ||
    accessLevel === "regional_view"
  ) {
    return true;
  }
  return (
    opts.canManageUsers === true ||
    opts.canViewCompensation === true ||
    opts.canViewSensitivePersonalInfo === true
  );
}

export function resolveDevLoginEmployeeBinding<
  T extends {
    id: number;
    accessLevel?: AccessLevel;
    canManageUsers?: boolean | null;
    canViewCompensation?: boolean | null;
    canViewSensitivePersonalInfo?: boolean | null;
  },
>(employee: T | null | undefined, env: NodeJS.ProcessEnv = process.env): T | null {
  if (!employee) return null;
  if (!isPrivilegedDevLoginIdentity(employee)) return employee;
  return isDevAdminImpersonationEnabled(env) ? employee : null;
}

export function isCronAuthorized(
  authHeader: string | null,
  secret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!secret || secret.trim() === "") return false;
  const provided = authHeader ?? "";
  const expected = `Bearer ${secret}`;
  return timingSafeEqualString(provided, expected);
}

/** SHA-256 both sides so the compare is constant-time regardless of length. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function canViewCustomFieldValue(opts: {
  field: { visibility?: string | null; section?: string | null; entityType?: string | null };
  isViewingSelf: boolean;
  isManager: boolean;
  isHROrAdmin: boolean;
  canViewCompensation: boolean;
}): boolean {
  const { field } = opts;
  const section = (field.section || field.entityType || "").toLowerCase();
  if (section === "compensation" && !opts.isViewingSelf && !opts.canViewCompensation) {
    return false;
  }

  const visibility = field.visibility || "everyone";
  switch (visibility) {
    case "everyone":
      return true;
    case "manager_hr":
      return opts.isViewingSelf || opts.isManager || opts.isHROrAdmin;
    case "hr_only":
      return opts.isViewingSelf || opts.isHROrAdmin;
    default:
      return false;
  }
}
