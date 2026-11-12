import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { employees, accessLevels } from "@/lib/db/schema";
import { runCustomEmployeeReport } from "@/lib/reports/custom";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { GET as preview } from "@/app/api/reports/preview/route";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

describe("Custom report access and filters (Real Postgres)", () => {
  const runId = Date.now();
  let manager: { id: number };
  let report: { id: number };
  let outsider: { id: number };

  beforeAll(async () => {
    await db
      .insert(accessLevels)
      .values({
        name: `Rpt Mgr ${runId}`,
        code: "manager",
        canViewCompensation: false,
        canEditCompensation: false,
        canViewSensitivePersonalInfo: false,
        canEditSensitivePersonalInfo: false,
        canViewBankInfo: false,
        canEditBankInfo: false,
        canManageUsers: false,
        canManageSettings: false,
        canApproveTimeOff: true,
        canApproveCompensationChanges: false,
      })
      .onConflictDoNothing();

    const [mgr] = await db
      .insert(employees)
      .values({
        employeeNumber: `RPT_MGR_${runId}`,
        firstName: "Report",
        lastName: "Manager",
        email: `rpt.mgr.${runId}@vendasta.com`,
        hireDate: "2019-01-01",
        employmentStatus: "full_time",
        accessLevel: "manager",
      })
      .returning();
    manager = mgr;

    const [rep] = await db
      .insert(employees)
      .values({
        employeeNumber: `RPT_REP_${runId}`,
        firstName: "Report",
        lastName: "Direct",
        email: `rpt.direct.${runId}@gmail.com`,
        hireDate: "2022-06-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        managerId: manager.id,
        jobTitle: "AE",
      })
      .returning();
    report = rep;

    const [out] = await db
      .insert(employees)
      .values({
        employeeNumber: `RPT_OUT_${runId}`,
        firstName: "Report",
        lastName: "Outsider",
        email: `rpt.out.${runId}@vendasta.com`,
        hireDate: "2021-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    outsider = out;
  });

  afterAll(async () => {
    try {
      await db.delete(employees).where(eq(employees.id, report.id));
      await db.delete(employees).where(eq(employees.id, outsider.id));
      await db.delete(employees).where(eq(employees.id, manager.id));
    } finally {
      await pool.end();
    }
  });

  test("manager report includes self and direct report, hides personal email, applies hire-date filter", async () => {
    const viewer = {
      employeeId: manager.id,
      accessLevel: "manager",
      canManageUsers: false,
      canViewCompensation: false,
      canViewSensitivePersonalInfo: false,
    };

    const all = await runCustomEmployeeReport({
      fields: ["firstName", "lastName", "email", "hireDate"],
      viewer,
    });
    const ids = all.rows.map((row: any) => `${row.firstName} ${row.lastName}`);
    expect(ids.some((name) => name.includes("Manager"))).toBe(true);
    expect(ids.some((name) => name.includes("Direct"))).toBe(true);
    expect(ids.some((name) => name.includes("Outsider"))).toBe(false);

    const direct = all.rows.find((row: any) => row.lastName === "Direct") as any;
    expect(direct.email).toBeNull();
    const self = all.rows.find((row: any) => row.lastName === "Manager") as any;
    expect(self.email).toBe(`rpt.mgr.${runId}@vendasta.com`);

    const filtered = await runCustomEmployeeReport({
      fields: ["lastName", "hireDate"],
      filters: { hireDateFrom: "2022-01-01" },
      viewer,
    });
    expect(filtered.rows.every((row: any) => row.lastName !== "Manager")).toBe(true);
    expect(filtered.rows.some((row: any) => row.lastName === "Direct")).toBe(true);

    const inferred = await runCustomEmployeeReport({
      fields: ["lastName", "email"],
      filters: { search: `rpt.direct.${runId}@gmail.com` },
      viewer,
    });
    expect(inferred.rows.some((row: any) => row.lastName === "Direct")).toBe(false);

    const workSearch = await runCustomEmployeeReport({
      fields: ["lastName", "email"],
      filters: { search: `rpt.mgr.${runId}@vendasta.com` },
      viewer,
    });
    expect(workSearch.rows.some((row: any) => row.lastName === "Manager")).toBe(true);
  });

  test("preview API scopes results to the session employee", async () => {
    (mockedAuth as jest.Mock).mockResolvedValue({
      user: {
        email: `rpt.out.${runId}@vendasta.com`,
        employeeId: outsider.id,
        role: "employee",
        id: `user-${outsider.id}`,
      },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    });

    const res = await preview(
      new NextRequest("http://localhost/api/reports/preview?fields=lastName,email")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows.length).toBe(1);
    expect(body.rows[0].lastName).toBe("Outsider");
    expect(body.rows[0].email).toBe(`rpt.out.${runId}@vendasta.com`);
  });
});
