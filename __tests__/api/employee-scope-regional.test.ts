import {
  canManageAccessScopes,
  canSeeAllEmployees,
  employeeMatchesAccessScope,
  visibleRelatedEmployeeName,
} from "@/lib/access-scopes";

describe("regional access v1 helpers", () => {
  test("does not treat regional_view as org-wide", () => {
    expect(
      canSeeAllEmployees({ employeeId: 1, accessLevel: "regional_view" })
    ).toBe(false);
  });

  test("full_admin, HR, and global_view stay org-wide", () => {
    expect(
      canSeeAllEmployees({ employeeId: 1, accessLevel: "full_admin" })
    ).toBe(true);
    expect(
      canSeeAllEmployees({
        employeeId: 2,
        accessLevel: "employee",
        canManageUsers: true,
      })
    ).toBe(true);
    expect(
      canSeeAllEmployees({ employeeId: 3, accessLevel: "global_view" })
    ).toBe(true);
  });

  test("empty allowlist matches no other employees", () => {
    expect(
      employeeMatchesAccessScope({ locationId: 4, country: "India" }, [])
    ).toBe(false);
  });

  test("only HR and full_admin may manage allowlists", () => {
    expect(
      canManageAccessScopes({ employeeId: 1, accessLevel: "full_admin" })
    ).toBe(true);
    expect(
      canManageAccessScopes({
        employeeId: 2,
        accessLevel: "employee",
        canManageUsers: true,
      })
    ).toBe(true);
    expect(
      canManageAccessScopes({ employeeId: 3, accessLevel: "regional_view" })
    ).toBe(false);
    expect(
      canManageAccessScopes({ employeeId: 4, accessLevel: "global_view" })
    ).toBe(false);
  });

  test("hides related names that are outside the allowlist", () => {
    const allowed = new Set([10]);
    expect(
      visibleRelatedEmployeeName(10, { firstName: "In", lastName: "Scope" }, allowed)
    ).toBe("In Scope");
    expect(
      visibleRelatedEmployeeName(99, { firstName: "Out", lastName: "Scope" }, allowed)
    ).toBe("");
    expect(
      visibleRelatedEmployeeName(99, { firstName: "Out", lastName: "Scope" }, "all")
    ).toBe("Out Scope");
  });

  test("matches explicit location id or case-insensitive country", () => {
    const scopes = [
      { locationId: 10, country: null },
      { locationId: null, country: "India" },
    ];
    expect(
      employeeMatchesAccessScope({ locationId: 10, country: "Canada" }, scopes)
    ).toBe(true);
    expect(
      employeeMatchesAccessScope({ locationId: 99, country: "india" }, scopes)
    ).toBe(true);
    expect(
      employeeMatchesAccessScope({ locationId: 99, country: "Canada" }, scopes)
    ).toBe(false);
  });
});
