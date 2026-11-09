import {
  canViewCustomFieldValue,
  canViewImmigrationNumbers,
  canViewPrivateDocuments,
  canWriteSettings,
  clampCandidateRating,
  isCronAuthorized,
  isDevLoginEnabled,
  isViewingAccessLevel,
  redactVisaDocumentNumber,
} from "@/lib/authz";
import { calendarDaysInclusive, takenDaysInYear } from "@/lib/calendar-days";
import { formatGender } from "@/lib/utils/formatters";
import { csvField, csvRow } from "@/lib/csv";
import { accrualPeriodKey, legacyBiweeklyPeriodKeys } from "@/lib/time-off-accrual-period";

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
});
