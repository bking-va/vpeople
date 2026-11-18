import { isVendastaWorkEmail } from "@/lib/authz";
import type {
  BambooEmployeeRecord,
  EmploymentStatus,
  Gender,
  MappedEmergencyContact,
  MappedEmployee,
  MappedEmployeeBundle,
} from "./types";

export const BRENDAN_WORK_EMAILS = [
  "bking@vendasta.com",
  "brendan.king@vendasta.com",
] as const;

export const EXCLUDED_BAMBOO_FIELDS = [
  "ssn",
  "sin",
  "nationalId",
  "nin",
  "passportNumber",
  "ein",
  "bankAccountNumber",
  "bankRoutingNumber",
  "bankName",
  "iban",
  "swiftCode",
  "accountNumber",
  "routingNumber",
] as const;

const MAPPED_BAMBOO_FIELDS = new Set([
  "id",
  "employeeNumber",
  "firstName",
  "middleName",
  "lastName",
  "preferredName",
  "workEmail",
  "homeEmail",
  "workPhone",
  "workPhoneExtension",
  "mobilePhone",
  "homePhone",
  "jobTitle",
  "department",
  "division",
  "location",
  "hireDate",
  "originalHireDate",
  "terminationDate",
  "employmentHistoryStatus",
  "employmentStatus",
  "status",
  "supervisorEId",
  "supervisorId",
  "supervisor",
  "reportsTo",
  "supervisorEmail",
  "gender",
  "dateOfBirth",
  "maritalStatus",
  "nationality",
  "citizenship",
  "address1",
  "address2",
  "city",
  "state",
  "zipcode",
  "country",
  "linkedIn",
  "twitterFeed",
  "lastChanged",
  "payRate",
  "payType",
  "payPer",
  "paidPer",
  "paySchedule",
  "payRateEffectiveDate",
]);

export function blankToNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "0000-00-00") return null;
  return text;
}

export function bambooIdOf(value: string | number | null | undefined): string {
  return String(value ?? "").trim();
}

export function isBrendanWorkEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (BRENDAN_WORK_EMAILS as readonly string[]).includes(normalized);
}

export function resolveLoginEmails(opts: {
  bambooId: string;
  workEmail?: string | null;
  homeEmail?: string | null;
}): { email: string; personalEmail: string | null } {
  const work = blankToNull(opts.workEmail)?.toLowerCase() ?? null;
  const home = blankToNull(opts.homeEmail)?.toLowerCase() ?? null;
  if (work) {
    return {
      email: work,
      personalEmail: home && home !== work ? home : isVendastaWorkEmail(work) ? home : work,
    };
  }
  if (home) {
    return { email: home, personalEmail: home };
  }
  return { email: `bamboo-${opts.bambooId}@users.invalid`, personalEmail: null };
}

export function mapGender(value: string | null | undefined): Gender | null {
  const raw = blankToNull(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (normalized === "male" || normalized === "m") return "male";
  if (normalized === "female" || normalized === "f") return "female";
  if (normalized === "non binary" || normalized === "nonbinary") return "non_binary";
  if (normalized === "prefer not to say" || normalized === "unspecified") {
    return "prefer_not_to_say";
  }
  return "other";
}

export function mapEmploymentStatus(input: {
  status?: string | null;
  employmentHistoryStatus?: string | null;
  employmentStatus?: string | null;
  terminationDate?: string | null;
}): EmploymentStatus {
  const terminationDate = blankToNull(input.terminationDate);
  const activity = (blankToNull(input.status) || "").toLowerCase();
  const label = (
    blankToNull(input.employmentHistoryStatus) ||
    blankToNull(input.employmentStatus) ||
    ""
  )
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();

  if (
    terminationDate ||
    label.includes("terminat") ||
    (activity === "inactive" && !label.includes("leave") && !label.includes("furlough"))
  ) {
    return "terminated";
  }
  if (
    label.includes("leave") ||
    label.includes("furlough") ||
    label.includes("sabbatical")
  ) {
    return "on_leave";
  }
  if (label.includes("contract") || label.includes("intern")) {
    return "contractor";
  }
  if (label.includes("part time") || label.includes("parttime")) {
    return "part_time";
  }
  return "full_time";
}

export const BAMBOO_HOURS_PER_WORKDAY = 8;

export function bambooBalanceToDays(
  value: string | number | null | undefined,
  units?: string | null
): string {
  const amount = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(amount)) return "0.00";
  const kind = (units || "days").trim().toLowerCase();
  const days = kind.startsWith("hour") ? amount / BAMBOO_HOURS_PER_WORKDAY : amount;
  return days.toFixed(2);
}

export function parsePayRate(
  value: string | number | null | undefined
): { amount: string | null; currency: string | null } {
  if (value === null || value === undefined || value === "") {
    return { amount: null, currency: null };
  }
  const raw = String(value).trim();
  const currencyMatch = raw.match(/\b([A-Z]{3})\b/);
  const numeric = raw.replace(/[^0-9.]/g, "");
  if (!numeric) return { amount: null, currency: currencyMatch?.[1] ?? null };
  const amount = Number.parseFloat(numeric);
  if (!Number.isFinite(amount)) {
    return { amount: null, currency: currencyMatch?.[1] ?? null };
  }
  return {
    amount: amount.toFixed(2),
    currency: currencyMatch?.[1] ?? null,
  };
}

export function collectUnmappedFieldNames(
  raw: Record<string, unknown>
): string[] {
  const excluded = new Set<string>(EXCLUDED_BAMBOO_FIELDS);
  const names: string[] = [];
  for (const key of Object.keys(raw)) {
    if (MAPPED_BAMBOO_FIELDS.has(key) || excluded.has(key)) continue;
    if (raw[key] === null || raw[key] === undefined || raw[key] === "") continue;
    names.push(key);
  }
  return names.sort();
}

export function mapEmployeeRecord(
  raw: BambooEmployeeRecord
): MappedEmployeeBundle {
  const bambooId = bambooIdOf(raw.id);
  const emails = resolveLoginEmails({
    bambooId,
    workEmail: blankToNull(raw.workEmail),
    homeEmail: blankToNull(raw.homeEmail),
  });
  const supervisorBambooId =
    blankToNull(raw.supervisorEId) || blankToNull(raw.supervisorId);
  const employee: MappedEmployee = {
    employeeNumber: blankToNull(raw.employeeNumber),
    firstName: blankToNull(raw.firstName) || "Unknown",
    middleName: blankToNull(raw.middleName),
    lastName: blankToNull(raw.lastName) || "Unknown",
    preferredName: blankToNull(raw.preferredName),
    email: emails.email,
    personalEmail: emails.personalEmail,
    workPhone: blankToNull(raw.workPhone),
    extension: blankToNull(raw.workPhoneExtension),
    mobilePhone: blankToNull(raw.mobilePhone),
    homePhone: blankToNull(raw.homePhone),
    jobTitle: blankToNull(raw.jobTitle),
    departmentName: blankToNull(raw.department),
    divisionName: blankToNull(raw.division),
    locationName: blankToNull(raw.location),
    hireDate: blankToNull(raw.hireDate),
    originalHireDate: blankToNull(raw.originalHireDate) || blankToNull(raw.hireDate),
    terminationDate: blankToNull(raw.terminationDate),
    employmentStatus: mapEmploymentStatus(raw),
    accessLevel: "employee",
    gender: mapGender(blankToNull(raw.gender)),
    birthDate: blankToNull(raw.dateOfBirth),
    maritalStatus: blankToNull(raw.maritalStatus),
    nationality: blankToNull(raw.nationality),
    citizenship: blankToNull(raw.citizenship),
    addressStreet1: blankToNull(raw.address1),
    addressStreet2: blankToNull(raw.address2),
    addressCity: blankToNull(raw.city),
    addressProvince: blankToNull(raw.state),
    addressPostalCode: blankToNull(raw.zipcode),
    addressCountry: blankToNull(raw.country),
    linkedInUrl: blankToNull(raw.linkedIn),
    twitterUrl: blankToNull(raw.twitterFeed),
  };

  return {
    bambooId,
    employee,
    supervisorBambooId,
    unmappedFields: collectUnmappedFieldNames(raw),
  };
}

export function mapEmergencyContact(
  raw: Record<string, unknown>
): MappedEmergencyContact | null {
  const name = blankToNull(raw.name);
  const phone =
    blankToNull(raw.mobilePhone) ||
    blankToNull(raw.phone) ||
    blankToNull(raw.workPhone) ||
    blankToNull(raw.homePhone);
  if (!name || !phone) return null;
  const primary = raw.primaryContact;
  return {
    name,
    relationship: blankToNull(raw.relationship),
    phone,
    alternatePhone:
      phone === blankToNull(raw.homePhone)
        ? blankToNull(raw.workPhone)
        : blankToNull(raw.homePhone),
    email: blankToNull(raw.email)?.toLowerCase() ?? null,
    isPrimary: primary === true || primary === "1" || primary === "yes",
  };
}

export const IMPORTED_EMPLOYEE_FIELDS = [
  "id",
  "employeeNumber",
  "firstName",
  "middleName",
  "lastName",
  "preferredName",
  "workEmail",
  "homeEmail",
  "workPhone",
  "workPhoneExtension",
  "mobilePhone",
  "homePhone",
  "jobTitle",
  "department",
  "division",
  "location",
  "hireDate",
  "originalHireDate",
  "terminationDate",
  "employmentHistoryStatus",
  "employmentStatus",
  "status",
  "supervisorEId",
  "gender",
  "dateOfBirth",
  "maritalStatus",
  "nationality",
  "citizenship",
  "address1",
  "address2",
  "city",
  "state",
  "zipcode",
  "country",
  "linkedIn",
  "twitterFeed",
  "lastChanged",
] as const;

export const UNMAPPED_KNOWN_BAMBOO_FIELDS = [
  "ethnicity",
  "eeo",
  "acaStatus",
  "acaStatusCategory",
  "facebook",
  "payGroup",
  "payGroupId",
  "exempt",
  "standardHoursPerWeek",
  "includeInPayroll",
  "timeTrackingEnabled",
  "createdByUserId",
  "photoUrl",
  "isPhotoUploaded",
  "bestEmail",
  "age",
  "birthday",
  "dependents",
  "employeeAssets",
  "employeeCertifications",
  "stockOptions",
  "equityGrants",
  "timeOffRequests",
] as const;
