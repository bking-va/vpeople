export const HIRE_PREFILL_FIELDS = [
  "candidateId",
  "firstName",
  "lastName",
  "email",
  "workPhone",
  "linkedInUrl",
  "jobTitle",
  "departmentId",
  "locationId",
  "hireDate",
  "employmentStatus",
] as const;

export type HirePrefill = {
  candidateId: number;
  firstName: string;
  lastName: string;
  email: string;
  workPhone: string;
  linkedInUrl: string;
  jobTitle: string;
  departmentId: string;
  locationId: string;
  hireDate: string;
  employmentStatus: string;
};

const EMPLOYMENT_STATUSES = new Set([
  "full_time",
  "part_time",
  "contractor",
  "on_leave",
  "terminated",
]);

export function canOpenEmployeeCreate(opts: {
  isHrOrAdmin: boolean;
  fromHiredCandidate: boolean;
  hiringAllowed: boolean;
}): boolean {
  if (opts.isHrOrAdmin) return true;
  return opts.fromHiredCandidate && opts.hiringAllowed;
}

export function resolveCreatedAccessLevel(opts: {
  requested?: string | null;
  isHrOrAdmin: boolean;
}): "employee" | "manager" | "regional_view" | "global_view" | "full_admin" {
  if (!opts.isHrOrAdmin) return "employee";
  const requested = opts.requested || "employee";
  if (
    requested === "manager" ||
    requested === "regional_view" ||
    requested === "global_view" ||
    requested === "full_admin"
  ) {
    return requested;
  }
  return "employee";
}

function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function safeHirePrefill(input: {
  candidate: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    linkedinUrl?: string | null;
    resumeUrl?: string | null;
    rating?: number | null;
  };
  opening?: {
    title?: string | null;
    departmentId?: number | null;
    locationId?: number | null;
    employmentType?: string | null;
  } | null;
  offer?: {
    jobTitle?: string | null;
    startDate?: string | Date | null;
    salary?: string | number | null;
  } | null;
}): HirePrefill {
  const employmentType = input.opening?.employmentType || "full_time";
  const prefill: HirePrefill = {
    candidateId: input.candidate.id,
    firstName: input.candidate.firstName,
    lastName: input.candidate.lastName,
    email: input.candidate.email,
    workPhone: input.candidate.phone || "",
    linkedInUrl: input.candidate.linkedinUrl || "",
    jobTitle: input.offer?.jobTitle || input.opening?.title || "",
    departmentId: input.opening?.departmentId
      ? String(input.opening.departmentId)
      : "",
    locationId: input.opening?.locationId ? String(input.opening.locationId) : "",
    hireDate: dateOnly(input.offer?.startDate),
    employmentStatus: EMPLOYMENT_STATUSES.has(employmentType)
      ? employmentType
      : "full_time",
  };
  return prefill;
}

export function hirePrefillHasForbiddenKeys(value: Record<string, unknown>): boolean {
  const forbidden = [
    "salary",
    "payRate",
    "resumeUrl",
    "notes",
    "rating",
    "userId",
    "vendastaSub",
  ];
  return forbidden.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}
