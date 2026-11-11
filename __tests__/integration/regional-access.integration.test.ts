import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employees,
  locations,
  employeeAccessScopes,
  timeOffPolicies,
  timeOffRequests,
  accessLevels,
} from "@/lib/db/schema";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { GET as listEmployees } from "@/app/api/employees/route";
import { GET as exportReports } from "@/app/api/reports/export/route";
import {
  GET as getAccessScopes,
  PUT as putAccessScopes,
} from "@/app/api/settings/access-scopes/route";
import { GET as timeOffCalendar } from "@/app/api/calendar/[token]/time-off/route";
import { GET as celebrationsCalendar } from "@/app/api/calendar/[token]/celebrations/route";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function session(user: { email: string; employeeId: number; role: string }) {
  mockedAuth.mockResolvedValue({
    user: { ...user, name: user.email, id: `user-${user.employeeId}` },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as any);
}

describe("Regional access v1 + iCal scope (Real Postgres)", () => {
  const runId = Date.now();
  const ids = {
    employees: [] as number[],
    locations: [] as number[],
    policies: [] as number[],
    requests: [] as number[],
  };
  let admin: { id: number; email: string };
  let regional: { id: number; email: string };
  let canadaEmp: { id: number; firstName: string; lastName: string };
  let indiaEmp: { id: number; firstName: string; lastName: string };
  let outsider: { id: number; email: string };
  let canadaLoc: { id: number };
  let indiaLoc: { id: number };
  const regionalToken = `reg-cal-${runId}`;
  const outsiderToken = `out-cal-${runId}`;

  beforeAll(async () => {
    await db
      .insert(accessLevels)
      .values([
        {
          name: `Reg Full Admin ${runId}`,
          code: "full_admin",
          canManageUsers: true,
          canViewCompensation: true,
          canEditCompensation: true,
          canViewSensitivePersonalInfo: true,
          canEditSensitivePersonalInfo: true,
          canViewBankInfo: true,
          canEditBankInfo: true,
          canManageSettings: true,
          canApproveTimeOff: true,
          canApproveCompensationChanges: true,
        },
        {
          name: `Reg View ${runId}`,
          code: "regional_view",
          canManageUsers: false,
          canViewCompensation: false,
          canEditCompensation: false,
          canViewSensitivePersonalInfo: false,
          canEditSensitivePersonalInfo: false,
          canViewBankInfo: false,
          canEditBankInfo: false,
          canManageSettings: false,
          canApproveTimeOff: false,
          canApproveCompensationChanges: false,
        },
      ])
      .onConflictDoNothing();

    const [canada] = await db
      .insert(locations)
      .values({
        name: `Canada Loc ${runId}`,
        country: "Canada",
        city: "Saskatoon",
      })
      .returning();
    canadaLoc = canada;
    ids.locations.push(canada.id);

    const [india] = await db
      .insert(locations)
      .values({
        name: `India Loc ${runId}`,
        country: "India",
        city: "Chennai",
      })
      .returning();
    indiaLoc = india;
    ids.locations.push(india.id);

    const [adminRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `REG_ADM_${runId}`,
        firstName: "Reg",
        lastName: "Admin",
        email: `reg.admin.${runId}@vendasta.com`,
        hireDate: "2018-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
        locationId: canada.id,
        birthDate: "1980-03-01",
      })
      .returning();
    admin = adminRow;
    ids.employees.push(admin.id);

    const [regionalRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `REG_VIEW_${runId}`,
        firstName: "Reg",
        lastName: "Viewer",
        email: `reg.view.${runId}@vendasta.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "regional_view",
        locationId: canada.id,
        calendarToken: regionalToken,
        birthDate: "1990-04-02",
      })
      .returning();
    regional = regionalRow;
    ids.employees.push(regional.id);

    const [canadaRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `REG_CA_${runId}`,
        firstName: "Canada",
        lastName: "Person",
        email: `reg.ca.${runId}@vendasta.com`,
        hireDate: "2021-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        locationId: canada.id,
        birthDate: "1991-05-03",
      })
      .returning();
    canadaEmp = canadaRow;
    ids.employees.push(canadaEmp.id);

    const [indiaRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `REG_IN_${runId}`,
        firstName: "India",
        lastName: "Person",
        email: `reg.in.${runId}@vendasta.com`,
        hireDate: "2021-02-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        locationId: india.id,
        birthDate: "1992-06-04",
      })
      .returning();
    indiaEmp = indiaRow;
    ids.employees.push(indiaEmp.id);

    const [outRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `REG_OUT_${runId}`,
        firstName: "Reg",
        lastName: "Outsider",
        email: `reg.out.${runId}@test.com`,
        hireDate: "2022-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        locationId: india.id,
        calendarToken: outsiderToken,
        birthDate: "1993-07-05",
      })
      .returning();
    outsider = outRow;
    ids.employees.push(outsider.id);

    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Reg Policy ${runId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "annual",
      })
      .returning();
    ids.policies.push(policy.id);

    const [indiaLeave] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: indiaEmp.id,
        policyId: policy.id,
        startDate: "2026-12-01",
        endDate: "2026-12-02",
        daysRequested: "2",
        status: "approved",
      })
      .returning();
    ids.requests.push(indiaLeave.id);

    const [canadaLeave] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: canadaEmp.id,
        policyId: policy.id,
        startDate: "2026-12-10",
        endDate: "2026-12-11",
        daysRequested: "2",
        status: "approved",
      })
      .returning();
    ids.requests.push(canadaLeave.id);
  });

  afterAll(async () => {
    try {
      for (const id of ids.requests) {
        await db.delete(timeOffRequests).where(eq(timeOffRequests.id, id));
      }
      for (const id of ids.employees) {
        await db.delete(employeeAccessScopes).where(eq(employeeAccessScopes.employeeId, id));
      }
      for (const id of ids.employees) {
        await db.delete(employees).where(eq(employees.id, id));
      }
      for (const id of ids.policies) {
        await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, id));
      }
      for (const id of ids.locations) {
        await db.delete(locations).where(eq(locations.id, id));
      }
    } finally {
      await pool.end();
    }
  });

  test("empty allowlist is fail-closed: regional_view sees only self", async () => {
    session({ email: regional.email, employeeId: regional.id, role: "employee" });
    const res = await listEmployees(new NextRequest("http://localhost/api/employees"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const idsListed = (body.employees || []).map((row: { id: number }) => row.id);
    expect(idsListed).toEqual([regional.id]);

    const exportRes = await exportReports(
      new NextRequest("http://localhost/api/reports/export?type=employees")
    );
    expect(exportRes.status).toBe(200);
    const csv = await exportRes.text();
    expect(csv).toContain(`REG_VIEW_${runId}`);
    expect(csv).not.toContain(`REG_IN_${runId}`);
    expect(csv).not.toContain(`REG_CA_${runId}`);
  });

  test("employee iCal token does not leak org-wide leave or birthdays", async () => {
    const ics = await timeOffCalendar(
      new NextRequest(`http://localhost/api/calendar/${outsiderToken}/time-off`),
      { params: Promise.resolve({ token: outsiderToken }) }
    );
    expect(ics.status).toBe(200);
    const icsBody = await ics.text();
    expect(icsBody).not.toContain("India Person");
    expect(icsBody).not.toContain("Canada Person");
    expect(icsBody).not.toContain("Reg Viewer");

    const celebrations = await celebrationsCalendar(
      new NextRequest(`http://localhost/api/calendar/${outsiderToken}/celebrations`),
      { params: Promise.resolve({ token: outsiderToken }) }
    );
    expect(celebrations.status).toBe(200);
    const celeBody = await celebrations.text();
    expect(celeBody).toContain("Reg Outsider");
    expect(celeBody).not.toContain("India Person");
    expect(celeBody).not.toContain("Canada Person");
  });

  test("employee cannot manage allowlists; full_admin cannot be region-scoped", async () => {
    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const forbidden = await putAccessScopes(
      new NextRequest("http://localhost/api/settings/access-scopes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: regional.id,
          locationIds: [canadaLoc.id],
          countries: ["Canada"],
        }),
      })
    );
    expect(forbidden.status).toBe(403);

    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const lockout = await putAccessScopes(
      new NextRequest("http://localhost/api/settings/access-scopes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: admin.id,
          locationIds: [canadaLoc.id],
          countries: [],
        }),
      })
    );
    expect(lockout.status).toBe(400);
    expect((await lockout.json()).error).toMatch(/full_admin/i);
  });

  test("HR allowlist grants location/country and iCal follows the same scope", async () => {
    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const put = await putAccessScopes(
      new NextRequest("http://localhost/api/settings/access-scopes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: regional.id,
          locationIds: [canadaLoc.id],
          countries: ["canada"],
        }),
      })
    );
    expect(put.status).toBe(200);

    const get = await getAccessScopes(
      new NextRequest(`http://localhost/api/settings/access-scopes?employeeId=${regional.id}`)
    );
    expect(get.status).toBe(200);
    const scopes = (await get.json()).scopes || [];
    expect(scopes.some((row: { locationId: number | null }) => row.locationId === canadaLoc.id)).toBe(
      true
    );
    expect(scopes.some((row: { country: string | null }) => row.country === "canada")).toBe(true);

    session({ email: regional.email, employeeId: regional.id, role: "employee" });
    const list = await listEmployees(new NextRequest("http://localhost/api/employees"));
    const listed = ((await list.json()).employees || []).map((row: { id: number }) => row.id);
    expect(listed).toEqual(expect.arrayContaining([regional.id, canadaEmp.id]));
    expect(listed).not.toContain(indiaEmp.id);

    const ics = await timeOffCalendar(
      new NextRequest(`http://localhost/api/calendar/${regionalToken}/time-off`),
      { params: Promise.resolve({ token: regionalToken }) }
    );
    const icsBody = await ics.text();
    expect(icsBody).toContain("Canada Person");
    expect(icsBody).not.toContain("India Person");

    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const adminList = await listEmployees(new NextRequest("http://localhost/api/employees"));
    const adminIds = ((await adminList.json()).employees || []).map((row: { id: number }) => row.id);
    expect(adminIds).toEqual(
      expect.arrayContaining([admin.id, regional.id, canadaEmp.id, indiaEmp.id])
    );
  });
});
