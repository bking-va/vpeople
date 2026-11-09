jest.mock("@/lib/db", () => ({ db: {} }));

import { filterEmployeeFields } from "@/lib/api-auth";

const none = {
  canViewCompensation: false,
  canEditCompensation: false,
  canViewSensitivePersonalInfo: false,
  canEditSensitivePersonalInfo: false,
  canViewBankInfo: false,
  canEditBankInfo: false,
  canManageUsers: false,
  canManageSettings: false,
  canApproveTimeOff: false,
  canApproveCompensationChanges: false,
};

const employee = {
  id: 9,
  firstName: "Pat",
  lastName: "Departed",
  email: "pat@gmail.com",
  roeCode: "M",
  terminationType: "involuntary",
  terminationReasonId: 4,
  terminationReason: "Dismissal",
};

describe("filterEmployeeFields termination privacy", () => {
  test("strips ROE and termination fields from coworker API payloads", () => {
    const filtered = filterEmployeeFields(employee, none, { isSelf: false });
    expect(filtered.roeCode).toBeUndefined();
    expect(filtered.terminationType).toBeUndefined();
    expect(filtered.terminationReasonId).toBeUndefined();
    expect(filtered.terminationReason).toBeUndefined();
  });

  test("keeps ROE and termination fields for self and sensitive-HR", () => {
    expect(filterEmployeeFields(employee, none, { isSelf: true }).roeCode).toBe("M");
    expect(
      filterEmployeeFields(employee, { ...none, canViewSensitivePersonalInfo: true }, { isSelf: false })
        .terminationType
    ).toBe("involuntary");
  });
});
