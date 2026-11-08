/**
 * Redact audit log changes based on viewer permissions.
 * Compensation, SIN/SSN, and bank fields are stored unredacted and masked at read time.
 */
export function redactAuditLogForViewer(
  changes: any,
  viewerPermissions: {
    canViewCompensation: boolean;
    canViewSensitivePersonalInfo: boolean;
    canViewBankInfo: boolean;
  }
): any {
  if (!changes || typeof changes !== "object") {
    return changes;
  }

  const redacted: any = {};

  for (const [key, value] of Object.entries(changes)) {
    const isCompensationField = [
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
    ].some((field) => field.toLowerCase() === key.toLowerCase());

    const isSensitivePersonalField = [
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
    ].some((field) => field.toLowerCase() === key.toLowerCase());

    const isBankingField = [
      "bankAccount",
      "bankAccountNumber",
      "bankRouting",
      "bankRoutingNumber",
      "iban",
      "swiftCode",
      "accountNumber",
      "routingNumber",
    ].some((field) => field.toLowerCase() === key.toLowerCase());

    const shouldRedact =
      (isCompensationField && !viewerPermissions.canViewCompensation) ||
      (isSensitivePersonalField && !viewerPermissions.canViewSensitivePersonalInfo) ||
      (isBankingField && !viewerPermissions.canViewBankInfo);

    if (shouldRedact) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactAuditLogForViewer(value, viewerPermissions);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
