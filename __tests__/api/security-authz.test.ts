import {
  canViewCustomFieldValue,
  canViewImmigrationNumbers,
  canViewIssuedLetterBody,
  canViewPersonalEmail,
  canViewPrivateDocuments,
  canViewTerminationDetails,
  canViewTimeOffLedger,
  canManageTimeOffOperations,
  canWriteSettings,
  isVendastaWorkEmail,
  visibleDirectoryEmail,
  visibleProfileEmail,
  clampCandidateRating,
  isCronAuthorized,
  isDevAdminImpersonationEnabled,
  isDevLoginEnabled,
  devLoginSessionRole,
  sessionRoleFromAccessLevel,
  isViewingAccessLevel,
  isTerminationHistoryRow,
  redactTerminationDetails,
  redactVisaDocumentNumber,
  resolveDevLoginEmployeeBinding,
} from "@/lib/authz";
import { emailMatchesReportSearch } from "@/lib/reports/custom";
import { calendarDaysInclusive, takenDaysInYear } from "@/lib/calendar-days";
import { formatGender } from "@/lib/utils/formatters";
import { csvField, csvRow } from "@/lib/csv";
import {
  accrualPeriodKey,
  carryoverCeiling,
  isCarryoverWindow,
  legacyBiweeklyPeriodKeys,
} from "@/lib/time-off-accrual-period";

describe("field-level authz helpers", () => {
  test("visa document numbers are redacted for coworkers", () => {
    expect(
      canViewImmigrationNumbers({
        isViewingSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(false);
    expect(
      redactVisaDocumentNumber({ documentNumber: "H1B-SECRET" }, false).documentNumber
    ).toBeNull();
    expect(
      redactVisaDocumentNumber({ documentNumber: "H1B-SECRET" }, true).documentNumber
    ).toBe("H1B-SECRET");
  });

  test("ROE and termination details are limited to self or sensitive-HR", () => {
    expect(
      canViewTerminationDetails({
        isViewingSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(false);
    expect(
      canViewTerminationDetails({
        isViewingSelf: true,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(true);
    expect(
      canViewTerminationDetails({
        isViewingSelf: false,
        canViewSensitivePersonalInfo: true,
      })
    ).toBe(true);

    const terminateRow = {
      roeCode: "M",
      terminationType: "involuntary",
      terminationReasonId: 7,
      terminationReason: "Dismissal",
      terminationTypeId: "termination",
      changeType: "terminate",
      comment: "Dismissal",
    };
    expect(redactTerminationDetails(terminateRow, false)).toEqual({
      ...terminateRow,
      roeCode: null,
      terminationType: null,
      terminationReasonId: null,
      terminationReason: null,
      terminationTypeId: null,
      comment: null,
    });
    expect(redactTerminationDetails(terminateRow, true)).toEqual(terminateRow);

    const hireRow = { changeType: "hire", comment: "Hire" };
    expect(redactTerminationDetails(hireRow, false).comment).toBe("Hire");

    const legacyTerminate = {
      changeType: "status_change",
      status: "terminated",
      comment: "Laid off — confidential",
      terminationReason: "Dismissal",
    };
    expect(isTerminationHistoryRow(legacyTerminate)).toBe(true);
    expect(redactTerminationDetails(legacyTerminate, false).comment).toBeNull();
    expect(redactTerminationDetails(legacyTerminate, false).terminationReason).toBeNull();
    expect(redactTerminationDetails(legacyTerminate, true).comment).toBe(
      "Laid off — confidential"
    );
  });

  test("compensation letter bodies require recipient identity or canViewCompensation", () => {
    expect(
      canViewIssuedLetterBody({
        isRecipient: false,
        containsCompensation: true,
        canViewCompensation: false,
      })
    ).toBe(false);
    expect(
      canViewIssuedLetterBody({
        isRecipient: false,
        containsCompensation: true,
        canViewCompensation: true,
      })
    ).toBe(true);
    expect(
      canViewIssuedLetterBody({
        isRecipient: true,
        containsCompensation: true,
        canViewCompensation: false,
      })
    ).toBe(true);
    expect(
      canViewIssuedLetterBody({
        isRecipient: false,
        containsCompensation: false,
        canViewCompensation: false,
      })
    ).toBe(true);
  });

  test("report search cannot infer personal emails without sensitive-info permission", () => {
    const personal = "secret.personal@gmail.com";
    expect(
      emailMatchesReportSearch({
        email: personal,
        search: "secret.personal",
        isSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(false);
    expect(
      emailMatchesReportSearch({
        email: personal,
        search: "secret.personal",
        isSelf: true,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(true);
    expect(
      emailMatchesReportSearch({
        email: "worker@vendasta.com",
        search: "worker@",
        isSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(true);
    expect(
      emailMatchesReportSearch({
        email: personal,
        search: "secret.personal",
        isSelf: false,
        canViewSensitivePersonalInfo: true,
      })
    ).toBe(true);
  });

  test("compensation custom fields are hidden from coworkers without permission", () => {
    expect(
      canViewCustomFieldValue({
        field: { visibility: "everyone", section: "compensation" },
        isViewingSelf: false,
        isManager: true,
        isHROrAdmin: false,
        canViewCompensation: false,
      })
    ).toBe(false);
    expect(
      canViewCustomFieldValue({
        field: { visibility: "everyone", section: "compensation" },
        isViewingSelf: true,
        isManager: false,
        isHROrAdmin: false,
        canViewCompensation: false,
      })
    ).toBe(true);
  });

  test("viewing roles cannot write settings", () => {
    expect(isViewingAccessLevel("global_view")).toBe(true);
    expect(canWriteSettings("global_view", "admin")).toBe(false);
    expect(canWriteSettings("full_admin", "full_admin")).toBe(true);
  });

  test("private document metadata is limited to self, HR, or full admin", () => {
    expect(
      canViewPrivateDocuments({
        isViewingSelf: false,
        canManageUsers: false,
        accessLevel: "global_view",
      })
    ).toBe(false);
    expect(
      canViewPrivateDocuments({
        isViewingSelf: true,
        canManageUsers: false,
        accessLevel: "employee",
      })
    ).toBe(true);
  });

  test("time-off ledger is hidden from coworkers and viewing roles", () => {
    expect(
      canViewTimeOffLedger({
        isViewingSelf: false,
        isManager: false,
        canManageUsers: false,
        accessLevel: "global_view",
      })
    ).toBe(false);
    expect(
      canViewTimeOffLedger({
        isViewingSelf: false,
        isManager: true,
        canManageUsers: false,
        accessLevel: "manager",
      })
    ).toBe(true);
    expect(
      canViewTimeOffLedger({
        isViewingSelf: true,
        isManager: false,
        canManageUsers: false,
        accessLevel: "employee",
      })
    ).toBe(true);
    expect(
      canViewTimeOffLedger({
        isViewingSelf: false,
        isManager: false,
        canManageUsers: true,
        accessLevel: "admin",
      })
    ).toBe(true);
    expect(
      canManageTimeOffOperations({
        accessLevel: "manager",
        canManageUsers: false,
      })
    ).toBe(false);
    expect(
      canManageTimeOffOperations({
        accessLevel: "employee",
        canManageUsers: true,
      })
    ).toBe(true);
  });

  test("@vendasta.com work emails stay visible; personal addresses are restricted", () => {
    expect(isVendastaWorkEmail("brendan.king@vendasta.com")).toBe(true);
    expect(isVendastaWorkEmail("Brendan.King@Vendasta.COM")).toBe(true);
    expect(isVendastaWorkEmail("brendan@gmail.com")).toBe(false);
    expect(isVendastaWorkEmail("notvendasta.com")).toBe(false);
    expect(isVendastaWorkEmail("user@notvendasta.com")).toBe(false);

    expect(
      canViewPersonalEmail({
        isViewingSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(false);
    expect(
      canViewPersonalEmail({
        isViewingSelf: false,
        canViewSensitivePersonalInfo: true,
      })
    ).toBe(true);

    expect(
      visibleDirectoryEmail("amy@vendasta.com", { isSelf: false })
    ).toBe("amy@vendasta.com");
    expect(visibleDirectoryEmail("amy@gmail.com", { isSelf: false })).toBeNull();
    expect(visibleDirectoryEmail("amy@gmail.com", { isSelf: true })).toBe("amy@gmail.com");

    expect(
      visibleProfileEmail("amy@vendasta.com", {
        isViewingSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe("amy@vendasta.com");
    expect(
      visibleProfileEmail("amy@gmail.com", {
        isViewingSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBeNull();
    expect(
      visibleProfileEmail("amy@gmail.com", {
        isViewingSelf: false,
        canViewSensitivePersonalInfo: true,
      })
    ).toBe("amy@gmail.com");
    expect(
      visibleProfileEmail("amy@gmail.com", {
        isViewingSelf: true,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe("amy@gmail.com");
  });
});

describe("cron and dev login fail-closed", () => {
  test("unset CRON_SECRET does not match Bearer undefined", () => {
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", "   ")).toBe(false);
    expect(isCronAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isCronAuthorized("Bearer other", "secret")).toBe(false);
    expect(isCronAuthorized(null, "secret")).toBe(false);
  });

  test("dev login is off in production without an explicit flag", () => {
    expect(
      isDevLoginEnabled({
        ENABLE_DEV_AUTH: "true",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      } as NodeJS.ProcessEnv)
    ).toBe(false);
    expect(
      isDevLoginEnabled({
        ENABLE_DEV_AUTH: "true",
        ALLOW_DEV_AUTH_IN_PRODUCTION: "true",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      } as NodeJS.ProcessEnv)
    ).toBe(true);
    expect(
      isDevLoginEnabled({
        ENABLE_DEV_AUTH: "true",
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv)
    ).toBe(true);
  });

  test("dev login does not impersonate admins from an email without an extra flag", () => {
    const devEnv = {
      ENABLE_DEV_AUTH: "true",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv;
    expect(isDevAdminImpersonationEnabled(devEnv)).toBe(false);
    expect(devLoginSessionRole("full_admin", devEnv)).toBe("employee");
    expect(devLoginSessionRole("global_view", devEnv)).toBe("employee");
    expect(devLoginSessionRole("regional_view", devEnv)).toBe("employee");
    expect(devLoginSessionRole("manager", devEnv)).toBe("manager");
    expect(sessionRoleFromAccessLevel("full_admin")).toBe("full_admin");
    expect(sessionRoleFromAccessLevel("global_view")).toBe("employee");
    expect(sessionRoleFromAccessLevel("partner")).toBe("employee");
    expect(
      devLoginSessionRole("full_admin", {
        ...devEnv,
        ALLOW_DEV_ADMIN_IMPERSONATION: "true",
      })
    ).toBe("full_admin");
    expect(
      isDevAdminImpersonationEnabled({
        ENABLE_DEV_AUTH: "true",
        ALLOW_DEV_ADMIN_IMPERSONATION: "true",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      } as NodeJS.ProcessEnv)
    ).toBe(false);

    const adminRow = {
      id: 9,
      accessLevel: "full_admin" as const,
      canManageUsers: true,
      canViewCompensation: true,
    };
    const hrRow = {
      id: 10,
      accessLevel: "employee" as const,
      canManageUsers: true,
      canViewCompensation: false,
    };
    const employeeRow = {
      id: 11,
      accessLevel: "employee" as const,
      canManageUsers: false,
      canViewCompensation: false,
    };
    expect(resolveDevLoginEmployeeBinding(adminRow, devEnv)).toBeNull();
    expect(resolveDevLoginEmployeeBinding(hrRow, devEnv)).toBeNull();
    expect(resolveDevLoginEmployeeBinding(employeeRow, devEnv)?.id).toBe(11);
    expect(
      resolveDevLoginEmployeeBinding(adminRow, {
        ...devEnv,
        ALLOW_DEV_ADMIN_IMPERSONATION: "true",
      })?.id
    ).toBe(9);
  });
});

describe("calendar day counts and ratings", () => {
  test("timestamp inputs count calendar dates, not elapsed hours", () => {
    expect(calendarDaysInclusive("2026-01-01T23:00:00Z", "2026-01-02T01:00:00Z")).toBe(2);
    expect(calendarDaysInclusive("2026-01-01", "2026-01-01")).toBe(1);
    expect(calendarDaysInclusive("2026-01-01", "2026-01-03")).toBe(3);
  });

  test("future scheduled leave is not counted as used", () => {
    const asOf = new Date("2026-11-09T12:00:00Z");
    expect(takenDaysInYear("2026-12-20", "2026-12-24", 2026, asOf)).toBe(0);
    expect(takenDaysInYear("2026-11-01", "2026-11-05", 2026, asOf)).toBe(5);
    expect(takenDaysInYear("2026-11-08", "2026-11-12", 2026, asOf)).toBe(2);
  });

  test("gender labels are humanized", () => {
    expect(formatGender("prefer_not_to_say")).toBe("Prefer not to say");
    expect(formatGender("non_binary")).toBe("Non-binary");
    expect(formatGender("male")).toBe("Male");
    expect(formatGender(null)).toBe("Unspecified");
  });

  test("candidate ratings are clamped to 1-5", () => {
    expect(clampCandidateRating(999999)).toBe(5);
    expect(clampCandidateRating(-3)).toBeNull();
    expect(clampCandidateRating(3)).toBe(3);
    expect(clampCandidateRating(null)).toBeNull();
  });
});

describe("csv formula escaping", () => {
  test("prefixes formula characters with a single quote", () => {
    expect(csvField("=1+1")).toBe(`"'=1+1"`);
    expect(csvField("+cmd")).toBe(`"'+cmd"`);
    expect(csvField("-1")).toBe(`"'-1"`);
    expect(csvField("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvField("\tTAB")).toBe(`"'\tTAB"`);
    expect(csvField("Safe Name")).toBe(`"Safe Name"`);
    expect(csvRow(["=CMD()", "ok"])).toBe(`"'=CMD()","ok"`);
  });
});

describe("biweekly accrual period", () => {
  test("ISO weeks 1 and 2 share a fortnight key", () => {
    const week1 = accrualPeriodKey("biweekly", new Date("2026-01-01T12:00:00Z"));
    const week2 = accrualPeriodKey("biweekly", new Date("2026-01-05T12:00:00Z"));
    const week3 = accrualPeriodKey("biweekly", new Date("2026-01-12T12:00:00Z"));
    expect(week1).toBe(week2);
    expect(week1).not.toBe(week3);
    expect(week1).toMatch(/-F\d{2}$/);
  });

  test("New Year week uses ISO week-year, not Gregorian year", () => {
    const late = accrualPeriodKey("biweekly", new Date("2025-12-29T12:00:00Z"));
    const early = accrualPeriodKey("biweekly", new Date("2026-01-01T12:00:00Z"));
    expect(late).toBe("2026-F01");
    expect(early).toBe("2026-F01");
  });

  test("legacy ISO-week keys cover both weeks in the fortnight", () => {
    const keys = legacyBiweeklyPeriodKeys(new Date("2026-01-05T12:00:00Z"));
    expect(keys).toEqual(expect.arrayContaining(["2026-W01", "2026-W02"]));
  });

  test("carryover window is January-only and preserves YTD credits in the cap", () => {
    expect(isCarryoverWindow(new Date("2029-01-15T12:00:00Z"))).toBe(true);
    expect(isCarryoverWindow(new Date("2029-11-15T12:00:00Z"))).toBe(false);
    expect(carryoverCeiling(5, 10)).toBe(15);
    expect(carryoverCeiling(5, 0)).toBe(5);
  });
});
