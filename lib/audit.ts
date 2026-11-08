import { db } from "./db";
import { auditLogs } from "./db/schema";

// Explicit list of sensitive field names that must be redacted
const SENSITIVE_FIELDS = [
  // Compensation
  "payRate",
  "payType",
  "payPer",
  "paySchedule",
  "salary",
  "hourlyRate",
  "annualSalary",
  "baseSalary",
  "bonus",
  "bonusAmount",
  "bonusTarget",
  "equity",
  "equityAmount",
  "stockOptions",
  "commission",
  "commissionRate",
  // Personal identifiers
  "sin",
  "ssn",
  "socialSecurityNumber",
  "socialInsuranceNumber",
  "passport",
  "passportNumber",
  "nationalId",
  "nationalIdNumber",
  "taxId",
  "taxIdNumber",
  // Banking
  "bankAccount",
  "bankAccountNumber",
  "bankRouting",
  "bankRoutingNumber",
  "iban",
  "swiftCode",
  "accountNumber",
  "routingNumber",
];

/**
 * Redact sensitive field values from changes object
 * Returns a new object with sensitive values replaced with "[REDACTED]"
 */
function redactSensitiveFields(changes: any): any {
  if (!changes || typeof changes !== "object") {
    return changes;
  }

  const redacted: any = {};

  for (const [key, value] of Object.entries(changes)) {
    // Check if key matches sensitive field list (case-insensitive)
    const isSensitive = SENSITIVE_FIELDS.some(
      (field) => field.toLowerCase() === key.toLowerCase()
    );

    if (isSensitive) {
      // For sensitive fields, store only a marker
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveFields(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export async function createAuditLog({
  employeeId,
  action,
  entityType,
  entityId,
  changes,
  ipAddress,
  userAgent,
}: {
  employeeId: number;
  action: string;
  entityType: string;
  entityId: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  // Redact sensitive fields before storing
  const redactedChanges = changes ? redactSensitiveFields(changes) : null;

  await db.insert(auditLogs).values({
    employeeId,
    action,
    entityType,
    entityId,
    changes: redactedChanges,
    ipAddress,
    userAgent,
  });
}

export type AuditAction =
  | "time_off_approved"
  | "time_off_denied"
  | "time_off_cancelled"
  | "employee_created"
  | "employee_updated"
  | "compensation_updated"
  | "job_info_updated"
  | "emergency_contact_added"
  | "emergency_contact_updated"
  | "emergency_contact_deleted";
