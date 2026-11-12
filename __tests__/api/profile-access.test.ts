/**
 * Profile Access Test
 * 
 * Tests that profile pages can be loaded for employees with different access levels
 */

import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getUserPermissions,
  getSessionUserPermissions,
} from "@/lib/permissions";

// Mock database
jest.mock("@/lib/db", () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  },
}));

describe("Profile Access by Access Level", () => {
  const accessLevels = [
    "employee",
    "manager",
    "regional_view",
    "global_view",
    "full_admin",
  ];

  test.each(accessLevels)(
    "getUserPermissions works for %s access level",
    async (accessLevel) => {
      // Mock response with each access level
      (db.limit as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          accessLevel,
          permissions: {
            canViewCompensation: accessLevel === "full_admin",
            canEditCompensation: accessLevel === "full_admin",
            canViewSensitivePersonalInfo: accessLevel === "full_admin",
            canEditSensitivePersonalInfo: accessLevel === "full_admin",
            canViewBankInfo: accessLevel === "full_admin",
            canEditBankInfo: accessLevel === "full_admin",
            canManageUsers: accessLevel === "full_admin",
            canManageSettings: accessLevel === "full_admin",
            canApproveTimeOff: ["manager", "full_admin"].includes(accessLevel),
            canApproveCompensationChanges: accessLevel === "full_admin",
          },
        },
      ]);

      const permissions = await getUserPermissions(`test-${accessLevel}@example.com`);

      // Should return permissions object without error
      expect(permissions).toBeDefined();
      expect(permissions).toHaveProperty("canViewCompensation");
      expect(permissions).toHaveProperty("canManageUsers");
      expect(permissions).toHaveProperty("canApproveTimeOff");
    }
  );

  test("handles employees with no access level gracefully", async () => {
    // Mock response with no permissions
    (db.limit as jest.Mock).mockResolvedValueOnce([
      {
        id: 1,
        accessLevel: null,
        permissions: null,
      },
    ]);

    const permissions = await getUserPermissions("noaccess@example.com");

    // Should return default (no permissions)
    expect(permissions.canViewCompensation).toBe(false);
    expect(permissions.canManageUsers).toBe(false);
  });

  test("handles non-existent employees gracefully", async () => {
    // Mock empty response
    (db.limit as jest.Mock).mockResolvedValueOnce([]);

    const permissions = await getUserPermissions("nonexistent@example.com");

    // Should return default (no permissions)
    expect(permissions.canViewCompensation).toBe(false);
    expect(permissions.canManageUsers).toBe(false);
  });

  test("unbound sessions do not inherit privileges", async () => {
    const permissions = await getSessionUserPermissions({
      user: { employeeId: null },
    });
    expect(permissions.canManageUsers).toBe(false);
    expect(permissions.canViewCompensation).toBe(false);
    expect(permissions.canViewSensitivePersonalInfo).toBe(false);
  });
});
