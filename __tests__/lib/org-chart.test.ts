import { readFileSync } from "fs";
import { join } from "path";
import {
  buildOrgChart,
  countDownlines,
  employeeDisplayName,
  formatDownlineSummary,
  isCeoJobTitle,
  isCurrentEmploymentStatus,
  type DownlineCounts,
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

function countsOf(
  node: OrgChartNode | null | undefined
): Pick<OrgChartNode, "directReportCount" | "totalDownlineCount"> | undefined {
  if (!node) return undefined;
  return {
    directReportCount: node.directReportCount,
    totalDownlineCount: node.totalDownlineCount,
  };
}

function mapCounts(
  people: OrgChartEmployee[],
  id: number
): DownlineCounts | undefined {
  return countDownlines(people).get(id);
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
    expect(countsOf(forest.ceo)).toEqual({
      directReportCount: 10,
      totalDownlineCount: 499,
    });
    expect(mapCounts(people, 1)).toEqual({
      directReports: 10,
      totalDownline: 499,
    });
    expect(mapCounts(people, 531)).toEqual({
      directReports: 0,
      totalDownline: 0,
    });
  });
});

describe("formatDownlineSummary", () => {
  it("shows both counts for managers and nothing for leaves", () => {
    expect(
      formatDownlineSummary({ directReports: 6, totalDownline: 142 })
    ).toBe("6 directs · 142 total");
    expect(
      formatDownlineSummary({ directReports: 1, totalDownline: 1 })
    ).toBe("1 direct · 1 total");
    expect(
      formatDownlineSummary({ directReports: 0, totalDownline: 0 })
    ).toBeNull();
  });
});

describe("countDownlines", () => {
  it("counts directs and the full current-employee downline", () => {
    const people = [
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 2, lastName: "Vp", managerId: 1 }),
      emp({ id: 3, lastName: "Dir", managerId: 2 }),
      emp({ id: 4, lastName: "IcA", managerId: 3 }),
      emp({ id: 5, lastName: "IcB", managerId: 3 }),
    ];

    const forest = buildOrgChart(people);
    expect(countsOf(forest.ceo)).toEqual({
      directReportCount: 1,
      totalDownlineCount: 4,
    });
    expect(countsOf(byId(forest.ceo, 2))).toEqual({
      directReportCount: 1,
      totalDownlineCount: 3,
    });
    expect(countsOf(byId(forest.ceo, 3))).toEqual({
      directReportCount: 2,
      totalDownlineCount: 2,
    });
    expect(countsOf(byId(forest.ceo, 4))).toEqual({
      directReportCount: 0,
      totalDownlineCount: 0,
    });

    const counts = countDownlines(people);
    expect(counts.get(1)).toEqual({ directReports: 1, totalDownline: 4 });
    expect(counts.get(2)).toEqual({ directReports: 1, totalDownline: 3 });
    expect(counts.get(3)).toEqual({ directReports: 2, totalDownline: 2 });
    expect(counts.get(4)).toEqual({ directReports: 0, totalDownline: 0 });
    expect(counts.get(5)).toEqual({ directReports: 0, totalDownline: 0 });
  });

  it("excludes terminated employees from both counts", () => {
    const people = [
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 2, lastName: "Current", managerId: 1 }),
      emp({
        id: 3,
        lastName: "Alumni",
        managerId: 1,
        employmentStatus: "terminated",
      }),
      emp({
        id: 4,
        lastName: "AlumniReport",
        managerId: 3,
      }),
    ];

    const counts = countDownlines(people);
    expect(counts.has(3)).toBe(false);
    expect(counts.get(1)).toEqual({ directReports: 1, totalDownline: 1 });
    expect(counts.get(4)).toEqual({ directReports: 0, totalDownline: 0 });
    expect(countsOf(buildOrgChart(people).ceo)).toEqual({
      directReportCount: 1,
      totalDownlineCount: 1,
    });
  });

  it("does not count people whose manager is missing or former under that manager", () => {
    const people = [
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({
        id: 9,
        lastName: "FormerMgr",
        employmentStatus: "terminated",
      }),
      emp({ id: 4, lastName: "OrphanLead", managerId: 9 }),
      emp({ id: 5, lastName: "OrphanReport", managerId: 4 }),
      emp({ id: 8, lastName: "Floater", managerId: null }),
    ];

    const forest = buildOrgChart(people);
    const counts = countDownlines(people);

    expect(counts.has(9)).toBe(false);
    expect(counts.get(1)).toEqual({ directReports: 0, totalDownline: 0 });
    expect(counts.get(4)).toEqual({ directReports: 1, totalDownline: 1 });
    expect(counts.get(5)).toEqual({ directReports: 0, totalDownline: 0 });
    expect(counts.get(8)).toEqual({ directReports: 0, totalDownline: 0 });
    expect(countsOf(forest.unmanaged.find((n) => n.id === 4))).toEqual({
      directReportCount: 1,
      totalDownlineCount: 1,
    });
    expect(countsOf(forest.unmanaged.find((n) => n.id === 8))).toEqual({
      directReportCount: 0,
      totalDownlineCount: 0,
    });
  });

  it("returns finite counts when the manager graph contains a cycle", () => {
    const people = [
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 2, lastName: "A", managerId: 3 }),
      emp({ id: 3, lastName: "B", managerId: 4 }),
      emp({ id: 4, lastName: "C", managerId: 2 }),
    ];

    const counts = countDownlines(people);
    const forest = buildOrgChart(people);

    expect(counts.get(1)).toEqual({ directReports: 0, totalDownline: 0 });
    const cycleTotals = [2, 3, 4].map((id) => counts.get(id)!);
    for (const c of cycleTotals) {
      expect(c.directReports).toBeGreaterThanOrEqual(0);
      expect(c.totalDownline).toBeGreaterThanOrEqual(c.directReports);
      expect(c.totalDownline).toBeLessThanOrEqual(2);
    }
    expect(cycleTotals.reduce((sum, c) => sum + c.totalDownline, 0)).toBeGreaterThan(0);
    expect(
      forest.unmanaged.every(
        (n) =>
          n.directReportCount === counts.get(n.id)?.directReports &&
          n.totalDownlineCount === counts.get(n.id)?.totalDownline
      )
    ).toBe(true);
    expect(isAcyclic(forest.unmanaged)).toBe(true);
  });

  it("treats a self-cycle as a leaf", () => {
    const people = [
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
      }),
      emp({ id: 6, lastName: "Loop", managerId: 6 }),
    ];

    expect(countDownlines(people).get(6)).toEqual({
      directReports: 0,
      totalDownline: 0,
    });
    expect(countsOf(buildOrgChart(people).unmanaged[0])).toEqual({
      directReportCount: 0,
      totalDownlineCount: 0,
    });
  });

  it("keeps CEO downline intact when the CEO record is in a reporting cycle", () => {
    const people = [
      emp({
        id: 1,
        jobTitle: "Chief Executive Officer",
        lastName: "Chief",
        managerId: 3,
      }),
      emp({ id: 2, lastName: "Vp", managerId: 1 }),
      emp({ id: 3, lastName: "Dir", managerId: 2 }),
    ];

    expect(countDownlines(people).get(1)).toEqual({
      directReports: 1,
      totalDownline: 2,
    });
    expect(countsOf(buildOrgChart(people).ceo)).toEqual({
      directReportCount: 1,
      totalDownlineCount: 2,
    });
  });

  it("does not require names or emails — profile counting can omit PII", () => {
    const counts = countDownlines([
      {
        id: 1,
        jobTitle: "CEO",
        managerId: null,
        employmentStatus: "full_time",
      },
      {
        id: 2,
        jobTitle: "VP",
        managerId: 1,
        employmentStatus: "full_time",
      },
    ]);
    expect(counts.get(1)).toEqual({ directReports: 1, totalDownline: 1 });
  });

  it("counts from the profile page's manager graph helper, not a raw unfiltered query", () => {
    const src = readFileSync(
      join(__dirname, "../../app/(dashboard)/people/[id]/page.tsx"),
      "utf8"
    );
    expect(src).toMatch(/countDownlines\(/);
    expect(src).not.toMatch(/directReports\.length/);
    const graphSelect = src.slice(
      src.indexOf("const reportingGraph"),
      src.indexOf("countDownlines(reportingGraph)")
    );
    expect(graphSelect).toMatch(/employees\.id/);
    expect(graphSelect).toMatch(/employees\.managerId/);
    expect(graphSelect).toMatch(/employees\.employmentStatus/);
    expect(graphSelect).not.toMatch(/employees\.email/);
    expect(graphSelect).not.toMatch(/employees\.firstName/);
  });
});
