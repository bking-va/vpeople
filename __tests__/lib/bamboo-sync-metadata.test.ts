import {
  isForbiddenBambooField,
  mapAssetRow,
  mapBambooCustomFieldType,
  mapCustomFieldValue,
  mapDependentRow,
  mapEmployeeExtras,
  mapMetaField,
} from "@/lib/bamboo-sync/map-metadata";
import {
  canViewCustomFieldValue,
  canViewDependents,
  canViewEeoDemographics,
} from "@/lib/authz";

describe("Bamboo metadata mapping", () => {
  test("never maps SIN/SSN/bank custom fields", () => {
    expect(isForbiddenBambooField("ssn")).toBe(true);
    expect(isForbiddenBambooField("customBankAccount")).toBe(true);
    expect(isForbiddenBambooField("customTeamName")).toBe(false);
    expect(mapMetaField({ alias: "ssn", name: "SSN", type: "ssn" })).toBeNull();
    expect(
      mapMetaField({
        alias: "customBonusTarget",
        name: "Bonus Target",
        type: "currency",
      })
    ).toMatchObject({
      bambooId: "customBonusTarget",
      fieldType: "number",
      section: "compensation",
      visibility: "hr_only",
    });
  });

  test("maps Bamboo field types onto vPeople custom field types", () => {
    expect(mapBambooCustomFieldType("list")).toBe("select");
    expect(mapBambooCustomFieldType("int")).toBe("number");
    expect(mapBambooCustomFieldType("checkbox")).toBe("checkbox");
    expect(mapBambooCustomFieldType("date")).toBe("date");
    expect(mapBambooCustomFieldType("text")).toBe("text");
  });

  test("maps assets and dependents without secret columns", () => {
    const asset = mapAssetRow(
      {
        id: "9",
        name: "MacBook Pro",
        category: "Laptop",
        serialNumber: "C02X",
        dateLoaned: "2024-01-02",
        ssn: "111-22-3333",
      },
      "404"
    );
    expect(asset).toMatchObject({
      bambooId: "asset:404:9",
      name: "MacBook Pro",
      serialNumber: "C02X",
    });
    expect(asset && "ssn" in asset).toBe(false);

    const dependent = mapDependentRow(
      {
        id: "3",
        firstName: "Sam",
        lastName: "Lee",
        relationship: "Child",
        dateOfBirth: "2018-05-01",
        ssn: "999-00-1111",
      },
      "404"
    );
    expect(dependent).toMatchObject({
      bambooId: "dep:404:3",
      firstName: "Sam",
      birthDate: "2018-05-01",
    });
    expect(JSON.stringify(dependent)).not.toMatch(/999-00-1111/);
  });

  test("maps ethnicity/EEO extras and skips empty rows", () => {
    expect(
      mapEmployeeExtras({
        id: "12",
        ethnicity: "Decline to specify",
        eeo: "Professionals",
        payGroup: "Salaried",
        exempt: "Yes",
        standardHoursPerWeek: "40",
        timeTrackingEnabled: "1",
      })
    ).toMatchObject({
      bambooId: "12",
      ethnicity: "Decline to specify",
      eeoJobCategory: "Professionals",
      flsaExempt: true,
      timeTrackingEnabled: true,
    });
    expect(mapEmployeeExtras({ id: "12" })).toBeNull();
  });

  test("maps custom field values from alias keys only", () => {
    const field = mapMetaField({
      alias: "customShirtSize",
      name: "Shirt Size",
      type: "list",
      options: ["S", "M", "L"],
    });
    expect(field?.options).toBe(JSON.stringify(["S", "M", "L"]));
    expect(
      mapCustomFieldValue({ id: "12", customShirtSize: "M" }, field!)
    ).toEqual({
      fieldBambooId: "customShirtSize",
      employeeBambooId: "12",
      value: "M",
    });
  });
});

describe("metadata access rules", () => {
  test("ethnicity/EEO is HR-admin only, including self", () => {
    expect(
      canViewEeoDemographics({ canViewSensitivePersonalInfo: false })
    ).toBe(false);
    expect(
      canViewEeoDemographics({ canViewSensitivePersonalInfo: true })
    ).toBe(true);
    expect(
      canViewCustomFieldValue({
        field: { visibility: "hr_only", section: "eeo" },
        isViewingSelf: true,
        isManager: false,
        isHROrAdmin: false,
        canViewCompensation: false,
      })
    ).toBe(false);
    expect(
      canViewCustomFieldValue({
        field: { visibility: "hr_only", section: "eeo" },
        isViewingSelf: false,
        isManager: false,
        isHROrAdmin: true,
        canViewCompensation: true,
      })
    ).toBe(true);
  });

  test("dependents are self or HR", () => {
    expect(
      canViewDependents({
        isViewingSelf: true,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(true);
    expect(
      canViewDependents({
        isViewingSelf: false,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(false);
    expect(
      canViewDependents({
        isViewingSelf: false,
        canViewSensitivePersonalInfo: true,
      })
    ).toBe(true);
  });
});

