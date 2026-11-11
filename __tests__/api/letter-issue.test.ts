import {
  buildLetterMergeValues,
  rejectClientMergeOverrides,
  renderLetter,
} from "@/lib/letter-issue";

const employee = {
  firstName: "Ada",
  lastName: "Lovelace",
  preferredName: null,
  jobTitle: "Engineer",
  departmentName: "R&D",
  locationName: "Chennai",
  hireDate: "2024-01-15",
  originalHireDate: "2020-01-15",
  employeeNumber: "E1",
  managerName: "Grace Hopper",
  payRate: "120000",
};

describe("letter issuance helpers", () => {
  test("rejects client-supplied merge overrides", () => {
    expect(rejectClientMergeOverrides({ employeeId: 1 })).toBeNull();
    expect(rejectClientMergeOverrides({ employeeId: 1, payRate: "9" })).toBeTruthy();
    expect(
      rejectClientMergeOverrides({ employeeId: 1, mergeValues: { firstName: "X" } })
    ).toBeTruthy();
  });

  test("omits payRate unless compensation is allowed", () => {
    const hidden = buildLetterMergeValues(employee, {
      includePayRate: false,
      effectiveDate: "2026-11-11",
    });
    expect(hidden.payRate).toBeNull();
    expect(hidden.firstName).toBe("Ada");

    const shown = buildLetterMergeValues(employee, {
      includePayRate: true,
      effectiveDate: "2026-11-11",
    });
    expect(shown.payRate).toBe("120000");
  });

  test("renders known tokens from existing templates without adding India copy", () => {
    const values = buildLetterMergeValues(employee, {
      includePayRate: false,
      effectiveDate: "2026-11-11",
    });
    const rendered = renderLetter(
      {
        subject: "Offer — {{jobTitle}}",
        body: "Dear {{firstName}} {{unknown}}, pay {{payRate}}",
      },
      values
    );
    expect(rendered.subject).toBe("Offer — Engineer");
    expect(rendered.body).toBe("Dear Ada {{unknown}}, pay ");
  });
});
