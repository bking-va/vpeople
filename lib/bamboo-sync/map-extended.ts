import { bambooBalanceToDays, blankToNull } from "./map";
import { EXCLUDED_BAMBOO_FIELDS } from "./map";
import type {
  JobOpeningStatus,
  MappedEducationWrite,
  MappedJobOpeningWrite,
  MappedTimeOffRequestWrite,
  MappedVisaWrite,
  TimeOffRequestStatus,
} from "./types";

export const BAMBOO_TIME_OFF_REQUEST_START_YEAR = 2020;
export const BAMBOO_TIME_OFF_REQUEST_END_YEAR = 2027;
export const BAMBOO_TIME_OFF_REQUEST_STATUSES = [
  "approved",
  "denied",
  "canceled",
  "cancelled",
  "requested",
  "superceded",
] as const;

const EXCLUDED_FIELD_SET = new Set<string>(EXCLUDED_BAMBOO_FIELDS);

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function labeledValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    return blankToNull(value);
  }
  const rec = asRecord(value);
  return (
    blankToNull(rec.label) ||
    blankToNull(rec.name) ||
    blankToNull(rec.title) ||
    blankToNull(rec.id)
  );
}

export function nestedId(value: unknown, keys: string[] = ["id"]): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    return blankToNull(value);
  }
  const rec = asRecord(value);
  for (const key of keys) {
    const found = blankToNull(rec[key]);
    if (found) return found;
  }
  return null;
}

function dropExcludedFields(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (EXCLUDED_FIELD_SET.has(key)) continue;
    next[key] = value;
  }
  return next;
}

export function mapTimeOffRequestStatus(
  value: unknown
): TimeOffRequestStatus | null {
  const rec = asRecord(value);
  const raw =
    blankToNull(rec.status) ||
    (typeof value === "string" || typeof value === "number"
      ? blankToNull(value)
      : null);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (
    normalized === "requested" ||
    normalized === "pending" ||
    normalized === "waiting" ||
    normalized === "submitted"
  ) {
    return "pending";
  }
  if (normalized === "approved" || normalized.startsWith("approved ")) {
    return "approved";
  }
  if (
    normalized === "denied" ||
    normalized === "rejected" ||
    normalized === "declined"
  ) {
    return "denied";
  }
  if (
    normalized === "canceled" ||
    normalized === "cancelled" ||
    normalized === "superceded" ||
    normalized === "superseded"
  ) {
    return "cancelled";
  }
  return null;
}

export function mapTimeOffRequest(
  rawInput: Record<string, unknown>
): MappedTimeOffRequestWrite | null {
  const raw = dropExcludedFields(rawInput);
  const bambooId = nestedId(raw.id) || blankToNull(raw.id);
  const employeeBambooId =
    nestedId(raw.employeeId) ||
    nestedId(raw.employee, ["employeeId", "id"]) ||
    blankToNull(raw.employeeId);
  const type = asRecord(raw.type);
  const typeName =
    labeledValue(raw.type) ||
    blankToNull(type.name) ||
    blankToNull(raw.timeOffTypeName);
  const startDate = blankToNull(raw.start) || blankToNull(raw.startDate);
  const endDate = blankToNull(raw.end) || blankToNull(raw.endDate) || startDate;
  const status = mapTimeOffRequestStatus(raw.status);
  if (!bambooId || !employeeBambooId || !typeName || !startDate || !status) {
    return null;
  }
  const amount = asRecord(raw.amount);
  const units =
    (typeof amount.unit === "string" ? amount.unit : null) ||
    (typeof raw.units === "string" ? raw.units : null);
  const daysRequested = bambooBalanceToDays(
    (amount.amount as string | number | null | undefined) ??
      (raw.amount as string | number | null | undefined),
    units
  );
  const notesObj = asRecord(raw.notes);
  const notes =
    blankToNull(notesObj.employee) ||
    (typeof raw.notes === "string" ? blankToNull(raw.notes) : null);
  const reviewNotes = blankToNull(notesObj.manager) || blankToNull(raw.reviewNotes);
  const statusObj = asRecord(raw.status);
  return {
    bambooId,
    employeeBambooId,
    typeName,
    typeBambooId: nestedId(type.id) || blankToNull(type.id),
    startDate,
    endDate: endDate || startDate,
    daysRequested,
    status,
    notes,
    reviewNotes,
    reviewedAt:
      blankToNull(statusObj.lastChanged) || blankToNull(raw.lastChanged),
    createdAt: blankToNull(raw.created) || blankToNull(raw.createdDate),
  };
}

export function mapJobOpeningStatus(
  value: unknown,
  statusesById: Map<string, { code?: number | null; name: string }> = new Map()
): JobOpeningStatus {
  const rec = asRecord(value);
  const id = nestedId(rec.id) || blankToNull(rec.id);
  const fromList = id ? statusesById.get(id) : undefined;
  const code = Number(
    rec.code ?? rec.raw ?? rec.statusGroup ?? fromList?.code ?? NaN
  );
  if (code === 1) return "draft";
  if (code === 2) return "open";
  if (code === 3) return "on_hold";
  if (code === 4) return "filled";
  if (code === 5) return "canceled";
  const label = (
    labeledValue(value) ||
    fromList?.name ||
    blankToNull(rec.label) ||
    ""
  )
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
  if (label.includes("draft")) return "draft";
  if (label.includes("hold")) return "on_hold";
  if (
    label.includes("fill") ||
    label.includes("hired") ||
    label.includes("closed")
  ) {
    return "filled";
  }
  if (label.includes("cancel")) return "canceled";
  if (
    label.includes("open") ||
    label.includes("active") ||
    label.includes("posted")
  ) {
    return "open";
  }
  return "draft";
}

function mapEmploymentType(value: unknown): string {
  const raw = labeledValue(value) || blankToNull(value);
  if (!raw) return "full_time";
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (normalized.includes("part")) return "part_time";
  if (normalized.includes("contract") || normalized.includes("intern")) {
    return "contractor";
  }
  return "full_time";
}

export function mapAtsJob(
  rawInput: Record<string, unknown>,
  statusesById: Map<string, { code?: number | null; name: string }> = new Map()
): MappedJobOpeningWrite | null {
  const raw = dropExcludedFields(rawInput);
  const bambooId = nestedId(raw.id) || blankToNull(raw.id);
  const title =
    labeledValue(raw.title) ||
    labeledValue(raw.jobOpeningName) ||
    blankToNull(raw.jobOpening);
  if (!bambooId || !title) return null;
  const hiringLead = asRecord(raw.hiringLead);
  const statusValue = raw.status ?? raw.jobOpeningStatus;
  const statusRec = asRecord(statusValue);
  return {
    bambooId,
    title,
    departmentName: labeledValue(raw.department),
    locationName: labeledValue(raw.location),
    hiringLeadBambooId:
      nestedId(hiringLead.employeeId) ||
      nestedId(raw.hiringLead, ["employeeId", "id"]),
    status: mapJobOpeningStatus(statusValue, statusesById),
    bambooStatusId: nestedId(statusRec.id) || blankToNull(statusRec.id),
    bambooStatusLabel:
      labeledValue(statusValue) || blankToNull(statusRec.label),
    employmentType: mapEmploymentType(
      raw.employmentStatus || raw.employmentType || raw.jobType
    ),
    description: blankToNull(raw.description) || blankToNull(raw.jobDescription),
    requirements:
      blankToNull(raw.requirements) || blankToNull(raw.minimumQualifications),
    openDate:
      blankToNull(raw.postedDate) ||
      blankToNull(raw.openDate) ||
      blankToNull(raw.datePosted),
    closeDate: blankToNull(raw.closeDate) || blankToNull(raw.closedDate),
  };
}

export function mapEducationRow(
  rawInput: Record<string, unknown>,
  employeeBambooId: string
): MappedEducationWrite | null {
  const raw = dropExcludedFields(rawInput);
  const bambooId =
    nestedId(raw.id) ||
    blankToNull(raw.id) ||
    (employeeBambooId
      ? `${employeeBambooId}:${blankToNull(raw.college) || blankToNull(raw.institution) || "edu"}`
      : null);
  const institution =
    blankToNull(raw.college) ||
    blankToNull(raw.institution) ||
    blankToNull(raw.school) ||
    blankToNull(raw.university) ||
    "Unknown";
  if (!bambooId || !employeeBambooId) return null;
  return {
    bambooId: `edu:${bambooId}`,
    employeeBambooId,
    institution,
    degree: blankToNull(raw.degree) || labeledValue(raw.degree),
    fieldOfStudy:
      blankToNull(raw.major) ||
      blankToNull(raw.fieldOfStudy) ||
      blankToNull(raw.field),
    startDate: blankToNull(raw.startDate) || blankToNull(raw.fromDate),
    endDate: blankToNull(raw.endDate) || blankToNull(raw.toDate),
    notes: blankToNull(raw.notes) || blankToNull(raw.gpa),
  };
}

function looksLikeSecretDocument(value: string | null): boolean {
  if (!value) return false;
  const key = value.toLowerCase();
  return (
    key.includes("ssn") ||
    key.includes("sin") ||
    key.includes("social insurance") ||
    key.includes("social security") ||
    key.includes("bank") ||
    key.includes("routing") ||
    key.includes("iban") ||
    key.includes("credit card")
  );
}

export function mapVisaRow(
  rawInput: Record<string, unknown>,
  employeeBambooId: string
): MappedVisaWrite | null {
  const raw = dropExcludedFields(rawInput);
  const bambooId = nestedId(raw.id) || blankToNull(raw.id);
  const visaType =
    blankToNull(raw.visaType) ||
    blankToNull(raw.type) ||
    labeledValue(raw.visa) ||
    "Unknown";
  if (!bambooId || !employeeBambooId) return null;
  const documentNumber = looksLikeSecretDocument(
    blankToNull(raw.documentNumber) || blankToNull(raw.number)
  )
    ? null
    : blankToNull(raw.documentNumber) ||
      blankToNull(raw.visaNumber) ||
      blankToNull(raw.number);
  return {
    bambooId: `visa:${bambooId}`,
    employeeBambooId,
    visaType,
    country:
      blankToNull(raw.country) ||
      blankToNull(raw.issuedBy) ||
      blankToNull(raw.nationality) ||
      "Unknown",
    documentNumber,
    issuedDate: blankToNull(raw.issuedDate) || blankToNull(raw.issueDate),
    expiryDate:
      blankToNull(raw.expiryDate) ||
      blankToNull(raw.expirationDate) ||
      blankToNull(raw.expires),
    status: (blankToNull(raw.status) || "active").toLowerCase(),
  };
}

export function timeOffRequestYears(
  mode: "full" | "incremental",
  now: Date
): number[] {
  const end = BAMBOO_TIME_OFF_REQUEST_END_YEAR;
  const start =
    mode === "full"
      ? BAMBOO_TIME_OFF_REQUEST_START_YEAR
      : Math.max(BAMBOO_TIME_OFF_REQUEST_START_YEAR, now.getUTCFullYear() - 1);
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}

export function emptyDatasetCounts(): {
  timeOffRequests: number;
  jobOpenings: number;
  education: number;
  visas: number;
  assets: number;
  dependents: number;
  customFields: number;
  customFieldValues: number;
  employeeExtras: number;
} {
  return {
    timeOffRequests: 0,
    jobOpenings: 0,
    education: 0,
    visas: 0,
    assets: 0,
    dependents: 0,
    customFields: 0,
    customFieldValues: 0,
    employeeExtras: 0,
  };
}
