import {
  LETTER_MERGE_FIELDS,
  applyMergeFields,
  letterTemplateContainsCompensation,
} from "@/lib/letter-merge";
import type { LetterMergeField } from "@/lib/letter-merge";

export type LetterEmployeeSnapshot = {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  jobTitle: string | null;
  departmentName: string | null;
  locationName: string | null;
  hireDate: string | null;
  originalHireDate: string | null;
  employeeNumber: string | null;
  managerName: string | null;
  payRate: string | null;
};

const COMPANY_NAME = "Vendasta";

export const ISSUED_LETTER_STATUS = "pending_signature" as const;

export function rejectClientMergeOverrides(body: Record<string, unknown>): string | null {
  if (body.mergeValues != null || body.mergeFields != null || body.payRate != null) {
    return "Merge values are server-derived; do not send mergeValues, mergeFields, or payRate";
  }
  return null;
}

export function buildLetterMergeValues(
  employee: LetterEmployeeSnapshot,
  opts: { includePayRate: boolean; effectiveDate?: string | null }
): Partial<Record<LetterMergeField, string | null>> {
  const displayName = employee.preferredName
    ? `${employee.preferredName} ${employee.lastName}`
    : `${employee.firstName} ${employee.lastName}`;
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    preferredName: employee.preferredName,
    displayName,
    jobTitle: employee.jobTitle,
    department: employee.departmentName,
    location: employee.locationName,
    hireDate: employee.hireDate,
    originalHireDate: employee.originalHireDate ?? employee.hireDate,
    effectiveDate: opts.effectiveDate ?? new Date().toISOString().slice(0, 10),
    payRate: opts.includePayRate ? employee.payRate : null,
    managerName: employee.managerName,
    employeeNumber: employee.employeeNumber,
    companyName: COMPANY_NAME,
  };
}

export function renderLetter(template: { subject: string | null; body: string }, values: Partial<Record<LetterMergeField, string | null>>) {
  return {
    subject: template.subject ? applyMergeFields(template.subject, values) : null,
    body: applyMergeFields(template.body, values),
  };
}

export function issuedLetterContainsCompensation(template: {
  subject?: string | null;
  body: string;
}): boolean {
  return (
    letterTemplateContainsCompensation(template.body) ||
    letterTemplateContainsCompensation(template.subject || "")
  );
}

export { LETTER_MERGE_FIELDS };
