import { readFileSync } from "fs";
import { join } from "path";
import { canSeeAllEmployees } from "@/lib/access-scopes";

const ROOT = join(__dirname, "../..");

function source(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("people directory RSC scope (PR #7 leftover)", () => {
  test("employee and manager are never treated as org-wide", () => {
    expect(canSeeAllEmployees({ employeeId: 1, accessLevel: "employee" })).toBe(
      false
    );
    expect(canSeeAllEmployees({ employeeId: 2, accessLevel: "manager" })).toBe(
      false
    );
  });

  test("directory and people list RSCs always call scopedEmployeeIds (fail closed)", () => {
    const pages = [
      "app/(dashboard)/people/page.tsx",
      "app/(dashboard)/people/directory/page.tsx",
      "app/(dashboard)/people/[id]/page.tsx",
      "app/(dashboard)/people/new/page.tsx",
    ];
    for (const page of pages) {
      const src = source(page);
      expect(src).toMatch(/scopedEmployeeIds\(/);
      expect(src).not.toMatch(
        /accessLevel === ["']regional_view["'][\s\S]{0,400}:\s*["']all["']/
      );
    }
  });
});
