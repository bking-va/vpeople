import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSessionUserPermissions } from "@/lib/permissions";
import { GET as getCustomFieldValues } from "@/app/api/custom-fields/values/route";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/permissions", () => ({
  getSessionUserPermissions: jest.fn(),
}));

jest.mock("@/lib/employee-scope", () => ({
  scopedEmployeeIds: jest.fn().mockResolvedValue("all"),
  employeeInScope: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/db", () => ({
  db: {
    select: jest.fn(),
  },
}));

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedPermissions = getSessionUserPermissions as jest.MockedFunction<
  typeof getSessionUserPermissions
>;

function chain(result: unknown) {
  const query: {
    from: () => typeof query;
    leftJoin: () => typeof query;
    where: () => typeof query;
    limit: () => Promise<unknown>;
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>;
  } = {
    from: () => query,
    leftJoin: () => query,
    where: () => query,
    limit: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function request(entityId: number) {
  return new NextRequest(
    new URL(`/api/custom-fields/values?entityId=${entityId}`, "http://localhost:3000")
  );
}

const emptyPermissions = {
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

describe("custom field values authorization", () => {
  beforeEach(() => {
    mockedAuth.mockReset();
    mockedPermissions.mockReset();
    (db.select as jest.Mock).mockReset();
    mockedAuth.mockResolvedValue({
      user: { email: "hr@vendasta.com", employeeId: 1 },
    } as never);
  });

  test("canManageUsers without sensitive-personal cannot read imported EEO values", async () => {
    mockedPermissions.mockResolvedValue({
      ...emptyPermissions,
      canManageUsers: true,
      canViewSensitivePersonalInfo: false,
    });
    (db.select as jest.Mock)
      .mockReturnValueOnce(
        chain([{ id: 1, accessLevel: "manager" }])
      )
      .mockReturnValueOnce(
        chain([{ id: 2, managerId: 9 }])
      )
      .mockReturnValueOnce(
        chain([
          {
            value: { id: 40, customFieldId: 7, entityId: 2, value: "Veteran" },
            field: {
              id: 7,
              name: "Veteran Status",
              section: "eeo",
              visibility: "hr_only",
            },
          },
        ])
      );

    const res = await getCustomFieldValues(request(2));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ values: [] });
  });

  test("sensitive-personal permission can read imported EEO values", async () => {
    mockedPermissions.mockResolvedValue({
      ...emptyPermissions,
      canManageUsers: true,
      canViewSensitivePersonalInfo: true,
    });
    (db.select as jest.Mock)
      .mockReturnValueOnce(
        chain([{ id: 1, accessLevel: "manager" }])
      )
      .mockReturnValueOnce(
        chain([{ id: 2, managerId: 9 }])
      )
      .mockReturnValueOnce(
        chain([
          {
            value: { id: 40, customFieldId: 7, entityId: 2, value: "Veteran" },
            field: {
              id: 7,
              name: "Veteran Status",
              section: "eeo",
              visibility: "hr_only",
            },
          },
        ])
      );

    const res = await getCustomFieldValues(request(2));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.values).toEqual([
      { id: 40, customFieldId: 7, entityId: 2, value: "Veteran" },
    ]);
  });

  test("managers without compensation permission cannot read OTE custom values", async () => {
    mockedAuth.mockResolvedValue({
      user: { email: "manager@vendasta.com", employeeId: 3 },
    } as never);
    mockedPermissions.mockResolvedValue({
      ...emptyPermissions,
      canViewCompensation: false,
    });
    (db.select as jest.Mock)
      .mockReturnValueOnce(
        chain([{ id: 3, accessLevel: "manager" }])
      )
      .mockReturnValueOnce(
        chain([{ id: 2, managerId: 3 }])
      )
      .mockReturnValueOnce(
        chain([
          {
            value: { id: 41, customFieldId: 8, entityId: 2, value: "120000" },
            field: {
              id: 8,
              name: "On Target Earnings",
              section: "compensation",
              visibility: "manager_hr",
            },
          },
        ])
      );

    const res = await getCustomFieldValues(request(2));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ values: [] });
  });
});
