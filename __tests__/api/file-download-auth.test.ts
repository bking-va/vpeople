import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPermissions, getSessionUserPermissions } from "@/lib/permissions";
import { GET as downloadDocument } from "@/app/api/documents/[id]/download/route";
import { GET as downloadCompanyFile } from "@/app/api/company-files/[id]/download/route";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/permissions", () => ({
  getUserPermissions: jest.fn(),
  getSessionUserPermissions: jest.fn(),
}));

jest.mock("@/lib/bamboo-sync/blob", () => ({
  getStoredPrivateBlob: jest.fn(),
}));

jest.mock("@/lib/db", () => {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  };
  return {
    db: {
      select: jest.fn(() => chain),
    },
  };
});

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedGetUserPermissions = getUserPermissions as jest.MockedFunction<
  typeof getUserPermissions
>;
const mockedGetSessionUserPermissions =
  getSessionUserPermissions as jest.MockedFunction<typeof getSessionUserPermissions>;

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("file download bound-session authorization", () => {
  beforeEach(() => {
    mockedAuth.mockReset();
    mockedGetUserPermissions.mockReset();
    mockedGetSessionUserPermissions.mockReset();
    mockedGetUserPermissions.mockResolvedValue({
      canViewCompensation: true,
      canEditCompensation: true,
      canViewSensitivePersonalInfo: true,
      canEditSensitivePersonalInfo: true,
      canViewBankInfo: true,
      canEditBankInfo: true,
      canManageUsers: true,
      canManageSettings: true,
      canApproveTimeOff: true,
      canApproveCompensationChanges: true,
    });
  });

  test("unbound HR email cannot download another employee's document", async () => {
    mockedAuth.mockResolvedValue({
      user: { email: "hr@vendasta.com", employeeId: null },
    } as never);

    const res = await downloadDocument(request("/api/documents/12/download"), {
      params: Promise.resolve({ id: "12" }),
    });

    expect(res.status).toBe(401);
    expect(mockedGetUserPermissions).not.toHaveBeenCalled();
    expect(mockedGetSessionUserPermissions).not.toHaveBeenCalled();
  });

  test("unbound full-admin email cannot download a company file", async () => {
    mockedAuth.mockResolvedValue({
      user: { email: "admin@vendasta.com", employeeId: null },
    } as never);

    const res = await downloadCompanyFile(
      request("/api/company-files/9/download"),
      { params: Promise.resolve({ id: "9" }) }
    );

    expect(res.status).toBe(401);
    expect(mockedGetUserPermissions).not.toHaveBeenCalled();
    expect(mockedGetSessionUserPermissions).not.toHaveBeenCalled();
  });
});
