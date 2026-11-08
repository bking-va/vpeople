import { redactAuditLogForViewer } from "@/lib/audit-redaction";

describe("Audit redaction (read-time)", () => {
  const changes = {
    payRate: "100000",
    payType: "salary",
    bonus: "20000",
    equity: "5000",
    sin: "123-456-789",
    ssn: "987-65-4321",
    bankAccount: "123456789",
    routingNumber: "021000021",
    jobTitle: "Engineer",
    firstName: "Jane",
    nested: { payRate: "95000", department: "Engineering" },
  };

  test("shows compensation amounts to viewers with canViewCompensation", () => {
    const result = redactAuditLogForViewer(changes, {
      canViewCompensation: true,
      canViewSensitivePersonalInfo: false,
      canViewBankInfo: false,
    });

    expect(result.payRate).toBe("100000");
    expect(result.payType).toBe("salary");
    expect(result.bonus).toBe("20000");
    expect(result.equity).toBe("5000");
    expect(result.nested.payRate).toBe("95000");
    expect(result.sin).toBe("[REDACTED]");
    expect(result.bankAccount).toBe("[REDACTED]");
    expect(result.jobTitle).toBe("Engineer");
  });

  test("redacts compensation amounts when viewer cannot view compensation", () => {
    const result = redactAuditLogForViewer(changes, {
      canViewCompensation: false,
      canViewSensitivePersonalInfo: true,
      canViewBankInfo: true,
    });

    expect(result.payRate).toBe("[REDACTED]");
    expect(result.payType).toBe("[REDACTED]");
    expect(result.bonus).toBe("[REDACTED]");
    expect(result.nested.payRate).toBe("[REDACTED]");
    expect(result.nested.department).toBe("Engineering");
    expect(result.sin).toBe("123-456-789");
    expect(result.bankAccount).toBe("123456789");
    expect(result.firstName).toBe("Jane");
  });

  test("does not redact non-sensitive fields", () => {
    const result = redactAuditLogForViewer(
      { firstName: "Jane", lastName: "Doe", jobTitle: "Senior Engineer" },
      {
        canViewCompensation: false,
        canViewSensitivePersonalInfo: false,
        canViewBankInfo: false,
      }
    );

    expect(result.firstName).toBe("Jane");
    expect(result.lastName).toBe("Doe");
    expect(result.jobTitle).toBe("Senior Engineer");
  });
});
