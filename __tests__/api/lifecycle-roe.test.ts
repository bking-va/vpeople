import { isCanadianRoeCode, roeLabel, DEFAULT_TERMINATION_REASONS } from "@/lib/roe";
import { applyMergeFields, SEEDED_LETTER_TEMPLATES } from "@/lib/letter-merge";
import { isApproverBlockedFromActing } from "@/lib/approval-errors";
import { visibleProfileEmail } from "@/lib/authz";

describe("Canadian ROE mapping", () => {
  test("seeded reasons use valid ROE codes", () => {
    for (const reason of DEFAULT_TERMINATION_REASONS) {
      expect(isCanadianRoeCode(reason.roeCode)).toBe(true);
      expect(roeLabel(reason.roeCode)).toBeTruthy();
    }
  });

  test("resignation maps to quit (E) and dismissal to M", () => {
    expect(DEFAULT_TERMINATION_REASONS.find((r) => r.code === "resignation")?.roeCode).toBe("E");
    expect(DEFAULT_TERMINATION_REASONS.find((r) => r.code === "dismissal")?.roeCode).toBe("M");
    expect(DEFAULT_TERMINATION_REASONS.find((r) => r.code === "retirement")?.roeCode).toBe("G");
  });

  test("rejects unknown ROE codes", () => {
    expect(isCanadianRoeCode("QQ")).toBe(false);
    expect(roeLabel("QQ")).toBeNull();
  });
});

describe("letter merge fields", () => {
  test("replaces known tokens and leaves unknown ones", () => {
    expect(
      applyMergeFields("Hello {{firstName}} {{unknown}}", { firstName: "Ada" })
    ).toBe("Hello Ada {{unknown}}");
  });

  test("seeded templates include required letter types", () => {
    expect(SEEDED_LETTER_TEMPLATES.map((t) => t.slug).sort()).toEqual(
      ["commission", "merit-increase", "offer", "promotion", "termination", "title-change"].sort()
    );
  });
});

describe("approval blocking for status and promotion", () => {
  test("blocks the affected employee from approving their own promotion", () => {
    expect(
      isApproverBlockedFromActing({
        entityType: "promotion",
        entityId: 10,
        requesterId: 2,
        viewerId: 10,
        isFinalStep: false,
      })
    ).toBe(true);
  });

  test("blocks requester final approval on employment status change", () => {
    expect(
      isApproverBlockedFromActing({
        entityType: "employment_status_change",
        entityId: 10,
        requesterId: 2,
        viewerId: 2,
        isFinalStep: true,
      })
    ).toBe(true);
  });
});

describe("report access helpers", () => {
  test("keeps @vendasta.com emails and hides personal emails from coworkers", () => {
    expect(
      visibleProfileEmail("ada@vendasta.com", {
        isViewingSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe("ada@vendasta.com");
    expect(
      visibleProfileEmail("ada@gmail.com", {
        isViewingSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBeNull();
    expect(
      visibleProfileEmail("ada@gmail.com", {
        isViewingSelf: true,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe("ada@gmail.com");
  });
});
