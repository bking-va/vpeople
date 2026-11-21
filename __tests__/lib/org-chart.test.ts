import { readFileSync } from "fs";
import { join } from "path";
import {
  buildOrgChart,
  employeeDisplayName,
  isCeoJobTitle,
  isCurrentEmploymentStatus,
  type OrgChartEmployee,
  type OrgChartNode,
} from "@/lib/org-chart";

function emp(
  partial: Partial<OrgChartEmployee> & Pick<OrgChartEmployee, "id">
): OrgChartEmployee {
  return {
    firstName: "Person",
    lastName: `N${partial.id}`,
    preferredName: null,
    jobTitle: "Engineer",
    email: `e${partial.id}@vendasta.com`,
    managerId: null,
    employmentStatus: "full_time",
    ...partial,
  };
}

function ids(node: OrgChartNode | null): number[] {
  if (!node) return [];
  return [node.id, ...node.children.flatMap(ids)];
}

function byId(node: OrgChartNode | null, id: number): OrgChartNode | undefined {
  if (!node) return undefined;
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = byId(child, id);
    if (found) return found;
  }
  return undefined;
}

function isAcyclic(nodes: OrgChartNode[], ancestors = new Set<number>()): boolean {
  for (const node of nodes) {
    if (ancestors.has(node.id)) return false;
    const next = new Set(ancestors);
    next.add(node.id);
    if (!isAcyclic(node.children, next)) return false;
  }
  return true;
}

describe("isCurrentEmploymentStatus", () => {
  it("treats every non-terminated status as current", () => {
    expect(isCurrentEmploymentStatus("full_time")).toBe(true);
    expect(isCurrentEmploymentStatus("part_time")).toBe(true);
    expect(isCurrentEmploymentStatus("contractor")).toBe(true);
    expect(isCurrentEmploymentStatus("on_leave")).toBe(true);
    expect(isCurrentEmploymentStatus("terminated")).toBe(false);
  });
});

describe("isCeoJobTitle", () => {
  it("matches CEO titles without depending on a specific person", () => {
    expect(isCeoJobTitle("Chief Executive Officer")).toBe(true);
    expect(isCeoJobTitle("Chief Executive Officer & Founder")).toBe(true);
    expect(isCeoJobTitle("CEO")).toBe(true);
    expect(isCeoJobTitle("CEO & Co-Founder")).toBe(true);
    expect(isCeoJobTitle("President and CEO")).toBe(true);
    expect(isCeoJobTitle("ceo")).toBe(true);
    expect(isCeoJobTitle("VP of Sales")).toBe(false);
    expect(isCeoJobTitle("Assistant to the CEO")).toBe(false);
    expect(isCeoJobTitle(null)).toBe(false);
  });
});

describe("buildOrgChart", () => {
  it("keeps a subsidiary CEO under the company CEO", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        lastName: "Chief",
        jobTitle: "Chief Executive Officer",
      }),
      emp({
        id: 2,
        lastName: "India",
        jobTitle: "CEO, India",
        managerId: 1,
      }),
      emp({ id: 3, lastName: "Ic", managerId: 2 }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    expect(ids(forest.ceo)).toEqual([1, 2, 3]);
    expect(forest.unmanaged).toEqual([]);
  });

  it("keeps a spelled-out subordinate CEO under an abbreviated company CEO", () => {
    const forest = buildOrgChart([
      emp({ id: 1, lastName: "Chief", jobTitle: "CEO" }),
      emp({
        id: 2,
        lastName: "India",
        jobTitle: "Chief Executive Officer",
        managerId: 1,
      }),
      emp({ id: 3, lastName: "Ic", managerId: 2 }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    expect(ids(forest.ceo)).toEqual([1, 2, 3]);
    expect(forest.unmanaged).toEqual([]);
  });

  it("puts a President and CEO above other managerless people", () => {
    const forest = buildOrgChart([
      emp({
        id: 2,
        firstName: "Aaron",
        lastName: "Aardvark",
        jobTitle: "Engineer",
        managerId: null,
      }),
      emp({
        id: 1,
        firstName: "Brenda",
        lastName: "Boss",
        jobTitle: "President and CEO",
        managerId: null,
      }),
      emp({ id: 3, lastName: "Cto", jobTitle: "CTO", managerId: 1 }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    expect(forest.unmanaged.map((n) => n.id)).toEqual([2]);
  });

  it("puts the CEO at the apex even when another managerless person sorts first", () => {
    const forest = buildOrgChart([
      emp({
        id: 2,
        firstName: "Aaron",
        lastName: "Aardvark",
        jobTitle: "Engineer",
        managerId: null,
      }),
      emp({
        id: 1,
        firstName: "Brenda",
        lastName: "Boss",
        jobTitle: "Chief Executive Officer",
        managerId: null,
      }),
      emp({
        id: 3,
        firstName: "Cara",
        lastName: "Cto",
        jobTitle: "CTO",
        managerId: 1,
      }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    expect(forest.ceo?.children.map((c) => c.id)).toEqual([3]);
    expect(forest.unmanaged.map((n) => n.id)).toEqual([2]);
    expect(forest.unmanaged[0].orphanReason).toBe("no_manager");
  });

  it("excludes former employees and does not place them in the tree", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 2, lastName: "Report", managerId: 1 }),
      emp({
        id: 3,
        lastName: "Alumni",
        managerId: 1,
        employmentStatus: "terminated",
      }),
    ]);

    expect(ids(forest.ceo)).toEqual([1, 2]);
    expect(forest.currentCount).toBe(2);
    expect(forest.unmanaged).toEqual([]);
  });

  it("keeps current people whose manager is former in the unmanaged group", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 2, lastName: "Vp", managerId: 1 }),
      emp({
        id: 9,
        lastName: "FormerMgr",
        employmentStatus: "terminated",
      }),
      emp({ id: 4, lastName: "OrphanLead", managerId: 9 }),
      emp({ id: 5, lastName: "OrphanReport", managerId: 4 }),
    ]);

    expect(ids(forest.ceo)).toEqual([1, 2]);
    expect(forest.unmanaged).toHaveLength(1);
    expect(forest.unmanaged[0].id).toBe(4);
    expect(forest.unmanaged[0].orphanReason).toBe("manager_not_current");
    expect(forest.unmanaged[0].children.map((c) => c.id)).toEqual([5]);
    expect(forest.unmanagedCount).toBe(2);
  });

  it("does not invent a manager when managerId is null", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 8, lastName: "Floater", managerId: null }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    expect(forest.ceo?.children).toEqual([]);
    expect(forest.unmanaged[0].id).toBe(8);
    expect(forest.unmanaged[0].orphanReason).toBe("no_manager");
  });

  it("still puts the CEO on top when their record has a manager set", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        firstName: "Brenda",
        lastName: "Boss",
        jobTitle: "Chief Executive Officer",
        managerId: 2,
      }),
      emp({
        id: 2,
        firstName: "Board",
        lastName: "Advisor",
        jobTitle: "Advisor",
        managerId: null,
      }),
      emp({ id: 3, lastName: "Vp", managerId: 1 }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    expect(forest.ceo?.children.map((c) => c.id)).toEqual([3]);
    expect(ids(forest.ceo)).toEqual([1, 3]);
    expect(forest.unmanaged.map((n) => n.id)).toEqual([2]);
  });

  it("keeps the CEO's reports when the CEO is in a reporting cycle", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
        managerId: 3,
      }),
      emp({ id: 2, lastName: "Vp", managerId: 1 }),
      emp({ id: 3, lastName: "Dir", managerId: 2 }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    expect(ids(forest.ceo).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(forest.unmanaged).toEqual([]);
    expect(isAcyclic(forest.ceo ? [forest.ceo] : [])).toBe(true);
  });

  it("does not serialize employee numbers onto the client tree", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 2, lastName: "Report", managerId: 1 }),
    ]);
    const json = JSON.stringify(forest);
    expect(json).not.toMatch(/employeeNumber/);
    expect(Object.keys(forest.ceo || {})).not.toContain("employeeNumber");
  });

  it("breaks cycles and keeps everyone visible", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 2, lastName: "A", managerId: 3 }),
      emp({ id: 3, lastName: "B", managerId: 4 }),
      emp({ id: 4, lastName: "C", managerId: 2 }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    const unmanagedIds = forest.unmanaged.flatMap((n) => ids(n)).sort((a, b) => a - b);
    expect(unmanagedIds).toEqual([2, 3, 4]);
    expect(forest.unmanagedCount).toBe(3);
    expect(isAcyclic(forest.unmanaged)).toBe(true);
    expect(forest.unmanaged.some((n) => n.orphanReason === "cycle")).toBe(true);
  });

  it("breaks a self-cycle without dropping the person", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 6, lastName: "Loop", managerId: 6 }),
    ]);

    expect(forest.unmanaged.map((n) => n.id)).toEqual([6]);
    expect(forest.unmanaged[0].orphanReason).toBe("cycle");
    expect(forest.unmanaged[0].children).toEqual([]);
  });

  it("includes part-time, contractor, and on-leave current employees", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({
        id: 2,
        lastName: "Part",
        managerId: 1,
        employmentStatus: "part_time",
      }),
      emp({
        id: 3,
        lastName: "Contract",
        managerId: 1,
        employmentStatus: "contractor",
      }),
      emp({
        id: 4,
        lastName: "Leave",
        managerId: 1,
        employmentStatus: "on_leave",
      }),
    ]);

    expect(forest.currentCount).toBe(4);
    expect(forest.ceo?.children.map((c) => c.id).sort((a, b) => a - b)).toEqual([
      2, 3, 4,
    ]);
  });

  it("falls back to the largest managerless tree when no CEO title exists", () => {
    const forest = buildOrgChart([
      emp({ id: 10, lastName: "SmallRoot", managerId: null }),
      emp({ id: 1, lastName: "BigRoot", jobTitle: "President", managerId: null }),
      emp({ id: 2, lastName: "A", managerId: 1 }),
      emp({ id: 3, lastName: "B", managerId: 1 }),
    ]);

    expect(forest.ceo?.id).toBe(1);
    expect(forest.unmanaged.map((n) => n.id)).toEqual([10]);
  });

  it("uses preferred name for the card label", () => {
    expect(
      employeeDisplayName({
        firstName: "William",
        lastName: "King",
        preferredName: "Bill",
      })
    ).toBe("Bill King");
  });

  it("keeps tree building out of the page so missing managers cannot become equal roots", () => {
    const src = readFileSync(
      join(__dirname, "../../app/(dashboard)/org-chart/page.tsx"),
      "utf8"
    );
    expect(src).toMatch(/buildOrgChart\(/);
    expect(src).toMatch(/employmentStatus, "terminated"/);
    expect(src).not.toMatch(/roots\.push/);
    expect(src).not.toMatch(/employeeNumber/);
  });

  it("handles an empty roster", () => {
    const forest = buildOrgChart([]);
    expect(forest.ceo).toBeNull();
    expect(forest.unmanaged).toEqual([]);
    expect(forest.currentCount).toBe(0);
  });

  it("builds a ~540 person tree with mixed orphans, former managers, and a CEO", () => {
    const people: OrgChartEmployee[] = [
      emp({
        id: 1,
        firstName: "Apex",
        lastName: "Leader",
        jobTitle: "Chief Executive Officer",
      }),
    ];

    for (let i = 2; i <= 11; i++) {
      people.push(emp({ id: i, lastName: `Exec${i}`, managerId: 1 }));
    }
    for (let i = 12; i <= 500; i++) {
      const managerId = 2 + ((i - 12) % 10);
      people.push(emp({ id: i, lastName: `Staff${i}`, managerId }));
    }
    for (let i = 501; i <= 520; i++) {
      people.push(
        emp({
          id: i,
          lastName: `Former${i}`,
          managerId: 1,
          employmentStatus: "terminated",
        })
      );
    }
    people.push(
      emp({
        id: 900,
        lastName: "GoneBoss",
        employmentStatus: "terminated",
      })
    );
    for (let i = 521; i <= 530; i++) {
      people.push(emp({ id: i, lastName: `FormerMgrReport${i}`, managerId: 900 }));
    }
    for (let i = 531; i <= 540; i++) {
      people.push(emp({ id: i, lastName: `NoMgr${i}`, managerId: null }));
    }
    people.push(emp({ id: 541, lastName: "CycleA", managerId: 542 }));
    people.push(emp({ id: 542, lastName: "CycleB", managerId: 541 }));

    const forest = buildOrgChart(people);

    expect(forest.ceo?.id).toBe(1);
    expect(forest.ceo?.children).toHaveLength(10);
    expect(ids(forest.ceo)).toHaveLength(500);
    expect(byId(forest.ceo, 12)?.id).toBe(12);
    expect(forest.currentCount).toBe(522);
    expect(forest.unmanagedCount).toBe(22);
    expect(forest.unmanaged.some((n) => n.orphanReason === "manager_not_current")).toBe(
      true
    );
    expect(forest.unmanaged.some((n) => n.orphanReason === "no_manager")).toBe(
      true
    );
    const unmanagedIds = new Set(forest.unmanaged.flatMap((n) => ids(n)));
    expect(unmanagedIds.has(521)).toBe(true);
    expect(unmanagedIds.has(531)).toBe(true);
    expect(unmanagedIds.has(541)).toBe(true);
    expect(unmanagedIds.has(900)).toBe(false);
    expect(ids(forest.ceo).some((id) => id >= 501 && id <= 520)).toBe(false);
  });
});
