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
  fetchMetadataPayload,
  mapMetadataPayload,
} from "@/lib/bamboo-sync/metadata";
import {
  BambooHrClient,
  BambooHrHttpError,
} from "@/lib/bamboo-sync/client";
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
    expect(isForbiddenBambooField("businessUnit")).toBe(false);
    expect(isForbiddenBambooField("customTeamName")).toBe(false);
    expect(mapMetaField({ alias: "homeEmail", name: "Home Email", type: "email" })).toBeNull();
    expect(mapMetaField({ alias: "dateOfBirth", name: "Birth Date", type: "date" })).toBeNull();
    expect(mapMetaField({ alias: "address1", name: "Address", type: "text" })).toBeNull();
    expect(
      mapMetaField({ alias: "customShirtSize", name: "Shirt Size", type: "list" })
    ).toMatchObject({
      visibility: "hr_only",
      section: "personal",
    });
    expect(
      mapMetaField({
        alias: "customOTE",
        name: "On Target Earnings",
        type: "currency",
      })
    ).toMatchObject({
      bambooId: "customOTE",
      section: "compensation",
      visibility: "hr_only",
    });
    expect(
      mapMetaField({
        alias: "customSocialInsuranceNumber",
        name: "Social Insurance Number",
        type: "text",
      })
    ).toBeNull();
    expect(
      mapMetaField({
        alias: "customTaxId",
        name: "Tax ID",
        type: "text",
      })
    ).toBeNull();
    expect(
      mapMetaField({
        alias: "customHomeEmail",
        name: "Home Email",
        type: "email",
      })
    ).toBeNull();
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
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(false);
    expect(
      canViewCustomFieldValue({
        field: { visibility: "hr_only", section: "eeo" },
        isViewingSelf: false,
        isManager: false,
        isHROrAdmin: true,
        canViewCompensation: true,
        canViewSensitivePersonalInfo: false,
      })
    ).toBe(false);
    expect(
      canViewCustomFieldValue({
        field: { visibility: "hr_only", section: "eeo" },
        isViewingSelf: false,
        isManager: false,
        isHROrAdmin: true,
        canViewCompensation: true,
        canViewSensitivePersonalInfo: true,
      })
    ).toBe(true);
  });

  test("currency compensation fields require canViewCompensation for managers", () => {
    expect(
      canViewCustomFieldValue({
        field: { visibility: "manager_hr", section: "compensation" },
        isViewingSelf: false,
        isManager: true,
        isHROrAdmin: false,
        canViewCompensation: false,
      })
    ).toBe(false);
    expect(
      canViewCustomFieldValue({
        field: { visibility: "manager_hr", section: "compensation" },
        isViewingSelf: false,
        isManager: true,
        isHROrAdmin: false,
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

describe("metadata custom field import", () => {
  test("dedupes meta fields that share a Bamboo alias so upserts do not abort", () => {
    const mapped = mapMetadataPayload({
      metaFields: [
        { alias: "customTeamName", name: "Team", type: "text" },
        { alias: "customTeamName", name: "Team (subfield)", type: "text" },
      ],
      employeeExtras: [],
      customValues: [],
      customValueAliasesFetched: [],
      assets: {},
      dependents: {},
      assetsFetched: false,
      dependentsFetched: false,
    });
    expect(mapped.customFields).toHaveLength(1);
    expect(mapped.customFields[0]).toMatchObject({
      bambooId: "customTeamName",
      name: "Team (subfield)",
    });
  });

  test("does not request national identifier or home email custom fields", async () => {
    const requested: string[][] = [];
    const client = {
      fetchMetaFields: async () => [
        { alias: "customShirtSize", name: "Shirt Size", type: "list" },
        {
          alias: "customSocialInsuranceNumber",
          name: "Social Insurance Number",
          type: "text",
        },
        { alias: "homeEmail", name: "Home Email", type: "email" },
        { alias: "customOTE", name: "On Target Earnings", type: "currency" },
      ],
      fetchCustomReport: async (opts: { title: string; fields: string[] }) => {
        requested.push(opts.fields);
        return [];
      },
      fetchMetaTables: async () => [],
      fetchAllTableRows: async () => {
        throw new BambooHrHttpError("GET", "/employees/all/tables/x", 404);
      },
      allowFullTable: () => undefined,
    } as unknown as BambooHrClient;

    await fetchMetadataPayload(client, () => undefined);
    const fields = requested.flat();
    expect(fields).toContain("customOTE");
    expect(fields).toContain("customShirtSize");
    expect(fields).not.toContain("customSocialInsuranceNumber");
    expect(fields).not.toContain("homeEmail");
  });

  test("does not mark omitted custom-report fields as fetched", async () => {
    const client = {
      fetchMetaFields: async () => [
        { alias: "customShirtSize", name: "Shirt Size", type: "list" },
        { alias: "customRestrictedNote", name: "Restricted note", type: "text" },
      ],
      fetchCustomReport: async (opts: { title: string; fields: string[] }) => {
        if (opts.title.includes("extras")) return [];
        return [{ id: "12", customShirtSize: "M" }];
      },
      fetchMetaTables: async () => [],
      fetchAllTableRows: async () => {
        throw new BambooHrHttpError("GET", "/employees/all/tables/x", 404);
      },
      allowFullTable: () => undefined,
    } as unknown as BambooHrClient;

    const payload = await fetchMetadataPayload(client, () => undefined);
    expect(payload.customValueAliasesFetched).toEqual(["customShirtSize"]);
    expect(payload.customValueAliasesFetched).not.toContain("customRestrictedNote");
  });
});

