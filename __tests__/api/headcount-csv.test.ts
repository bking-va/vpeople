import { headcountToCsv } from "@/lib/reports/headcount-format";

describe("headcountToCsv", () => {
  test("emits department, location, status, and total rows", () => {
    const csv = headcountToCsv({
      totalActive: 3,
      terminated: 1,
      byDepartment: [
        { departmentId: 1, department: "Engineering", count: 2 },
        { departmentId: null, department: null, count: 1 },
      ],
      byLocation: [{ locationId: 1, location: "Saskatoon HQ", count: 3 }],
      byStatus: [
        { employmentStatus: "full_time", count: 3 },
        { employmentStatus: "terminated", count: 1 },
      ],
    });

    expect(csv).toContain('"Category","Name","Count"');
    expect(csv).toContain('"Department","Engineering","2"');
    expect(csv).toContain('"Department","No Department","1"');
    expect(csv).toContain('"Location","Saskatoon HQ","3"');
    expect(csv).toContain('"Status","full_time","3"');
    expect(csv).toContain('"Total","Active","3"');
  });

  test("neutralizes formula prefixes in department names", () => {
    const csv = headcountToCsv({
      totalActive: 1,
      terminated: 0,
      byDepartment: [{ departmentId: 1, department: "=CMD()", count: 1 }],
      byLocation: [],
      byStatus: [],
    });
    expect(csv).toContain('"\'=CMD()"');
  });
});
