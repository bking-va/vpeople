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

export function canViewOfferSalary(opts: {
  canViewCompensation: boolean;
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
}) {
  return opts.canViewCompensation || isFullAdmin(opts.accessLevel) || opts.canManageUsers === true;
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
