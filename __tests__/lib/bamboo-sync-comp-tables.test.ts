import {
  BAMBOO_COMPENSATION_TABLES,
  mapCompensationTableRow,
  stripForbiddenCompFields,
} from "@/lib/bamboo-sync/map-comp-tables";
import { canViewBambooCompensationTables } from "@/lib/authz";

describe("Bamboo compensation table mapping", () => {
  test("covers the nine approved custom table aliases", () => {
    expect(BAMBOO_COMPENSATION_TABLES.map((table) => table.alias)).toEqual([
      "customTeamInformation",
      "customAdjustments",
      "customVariablePayActuals",
      "customInternalReporting",
      "customAnnualBonus",
      "customShiftTiming",
      "customCommissionPlanDetails",
      "customStatutoryBonusPlanDetails",
      "customCommissionSupplements",
    ]);
  });

  test("drops SIN/SSN/bank keys from row payloads", () => {
    const mapped = mapCompensationTableRow(
      {
        id: "22",
        amount: "1500",
        ssn: "111-22-3333",
        bankAccountNumber: "999",
      },
      "404",
      "customAnnualBonus"
    );
    expect(mapped).toMatchObject({
      bambooId: "ct:customAnnualBonus:404:22",
      tableAlias: "customAnnualBonus",
    });
    expect(mapped?.rowData).toEqual({ id: "22", amount: "1500" });
    expect(JSON.stringify(mapped)).not.toMatch(/111-22-3333/);
    expect(stripForbiddenCompFields({ sin: "x", note: "ok" })).toEqual({
      note: "ok",
    });
    expect(
      stripForbiddenCompFields({
        businessUnit: "Business Development",
        type: "Signing bonus",
        status: "Single",
      })
    ).toEqual({
      businessUnit: "Business Development",
      type: "Signing bonus",
      status: "Single",
    });
  });
});

describe("compensation table access", () => {
  test("matches current compensation rules: self or canViewCompensation", () => {
    expect(
      canViewBambooCompensationTables({
        isViewingSelf: true,
        canViewCompensation: false,
      })
    ).toBe(true);
    expect(
      canViewBambooCompensationTables({
        isViewingSelf: false,
        canViewCompensation: true,
      })
    ).toBe(true);
    expect(
      canViewBambooCompensationTables({
        isViewingSelf: false,
        canViewCompensation: false,
      })
    ).toBe(false);
  });
});
