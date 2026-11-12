import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray } from "drizzle-orm";
import {
  employees,
  timeOffPolicies,
  timeOffBalances,
  timeOffRequests,
  timeOffBalanceAdjustments,
  holidays,
  accessLevels,
  approvalRequests,
  approvalRequestSteps,
  auditLogs,
} from "@/lib/db/schema";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { POST as createSessionTimeOff } from "@/app/api/time-off/requests/route";
import { POST as postAdjustment } from "@/app/api/time-off/adjustments/route";
import { POST as postHoliday, GET as getHolidays } from "@/app/api/holidays/route";
import { PATCH as patchHoliday, DELETE as deleteHoliday } from "@/app/api/holidays/[id]/route";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function session(user: { email: string; employeeId: number; role: string }) {
  mockedAuth.mockResolvedValue({
    user: { ...user, name: user.email, id: `user-${user.employeeId}` },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as any);
}

describe("Time-off ops: ledger, holidays, holiday exclusion (Real Postgres)", () => {
  const runId = Date.now();
  const ids = {
    employees: [] as number[],
    policies: [] as number[],
    balances: [] as number[],
    requests: [] as number[],
    holidays: [] as number[],
    adjustments: [] as number[],
  };
  let admin: { id: number; email: string };
  let worker: { id: number; email: string };
  let outsider: { id: number; email: string };
  let policy: { id: number };

  beforeAll(async () => {
    await db
      .insert(accessLevels)
      .values({
        name: `Ops Admin ${runId}`,
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
      })
      .onConflictDoNothing();

    const [adminRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `OPS_ADM_${runId}`,
        firstName: "Ops",
        lastName: "Admin",
        email: `ops.admin.${runId}@vendasta.com`,
        hireDate: "2018-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    admin = adminRow;
    ids.employees.push(admin.id);

    const [workerRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `OPS_EMP_${runId}`,
        firstName: "Ops",
        lastName: "Worker",
        email: `ops.worker.${runId}@vendasta.com`,
        hireDate: "2021-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    worker = workerRow;
    ids.employees.push(worker.id);

    const [outRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `OPS_OUT_${runId}`,
        firstName: "Ops",
        lastName: "Outsider",
        email: `ops.out.${runId}@test.com`,
        hireDate: "2022-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    outsider = outRow;
    ids.employees.push(outsider.id);

    const [pol] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Ops Policy ${runId}`,
        policyType: "vacation",
        accrualRate: "15",
        accrualPeriod: "annual",
      })
      .returning();
    policy = pol;
    ids.policies.push(policy.id);

    for (const empId of [worker.id, outsider.id, admin.id]) {
      const [bal] = await db
        .insert(timeOffBalances)
        .values({ employeeId: empId, policyId: policy.id, balance: "10.00" })
        .returning();
      ids.balances.push(bal.id);
    }
  });

  afterAll(async () => {
    try {
      if (ids.employees.length) {
        const approvalRows = await db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(inArray(approvalRequests.requesterId, ids.employees));
        const approvalIds = approvalRows.map((row) => row.id);
        if (approvalIds.length) {
          await db
            .delete(approvalRequestSteps)
            .where(inArray(approvalRequestSteps.approvalRequestId, approvalIds));
          await db.delete(approvalRequests).where(inArray(approvalRequests.id, approvalIds));
        }
        await db
          .delete(timeOffRequests)
          .where(inArray(timeOffRequests.employeeId, ids.employees));
        await db
          .delete(timeOffBalanceAdjustments)
          .where(inArray(timeOffBalanceAdjustments.adjustedBy, ids.employees));
        await db
          .delete(timeOffBalances)
          .where(inArray(timeOffBalances.employeeId, ids.employees));
        await db.delete(auditLogs).where(inArray(auditLogs.employeeId, ids.employees));
      }
      if (ids.holidays.length) {
        await db.delete(holidays).where(inArray(holidays.id, ids.holidays));
      }
      if (ids.employees.length) {
        await db.delete(employees).where(inArray(employees.id, ids.employees));
      }
      if (ids.policies.length) {
        await db.delete(timeOffPolicies).where(inArray(timeOffPolicies.id, ids.policies));
      }
    } finally {
      await pool.end();
    }
  });

  test("employee cannot write the adjustment ledger or holidays", async () => {
    session({ email: worker.email, employeeId: worker.id, role: "employee" });
    const adjust = await postAdjustment(
      new NextRequest("http://localhost/api/time-off/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: worker.id,
          policyId: policy.id,
          amount: 2,
          reason: "should not work",
        }),
      })
    );
    expect(adjust.status).toBe(403);

    const holiday = await postHoliday(
      new NextRequest("http://localhost/api/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Forbidden ${runId}`,
          date: "2026-12-25",
          country: "CA",
        }),
      })
    );
    expect(holiday.status).toBe(403);
  });

  test("full_admin records a durable ledger row and updates the balance", async () => {
    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const res = await postAdjustment(
      new NextRequest("http://localhost/api/time-off/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: worker.id,
          policyId: policy.id,
          amount: 2.5,
          reason: "manual correction",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.adjustment.reason).toBe("manual correction");
    expect(parseFloat(body.adjustment.amount)).toBe(2.5);
    expect(body.adjustment.adjustedBy).toBe(admin.id);
    ids.adjustments.push(body.adjustment.id);

    const [balance] = await db
      .select({ balance: timeOffBalances.balance })
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, ids.balances[0]))
      .limit(1);
    expect(parseFloat(balance.balance)).toBe(12.5);

    const [ledger] = await db
      .select()
      .from(timeOffBalanceAdjustments)
      .where(eq(timeOffBalanceAdjustments.id, body.adjustment.id))
      .limit(1);
    expect(ledger.reason).toBe("manual correction");
    expect(ledger.adjustedBy).toBe(admin.id);
  });

  test("company holidays are CRUD for HR/full_admin and excluded from request days", async () => {
    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const created = await postHoliday(
      new NextRequest("http://localhost/api/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Ops Day ${runId}`,
          date: "2026-03-17",
          country: "CA",
          isRecurring: false,
        }),
      })
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const holidayId = createdBody.holiday.id as number;
    ids.holidays.push(holidayId);

    const patched = await patchHoliday(
      new NextRequest(`http://localhost/api/holidays/${holidayId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `Ops Day Updated ${runId}` }),
      }),
      { params: Promise.resolve({ id: String(holidayId) }) }
    );
    expect(patched.status).toBe(200);

    session({ email: worker.email, employeeId: worker.id, role: "employee" });
    const requestRes = await createSessionTimeOff(
      new NextRequest("http://localhost/api/time-off/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policyId: policy.id,
          startDate: "2026-03-16",
          endDate: "2026-03-18",
        }),
      })
    );
    expect(requestRes.status).toBe(200);
    const requestBody = await requestRes.json();
    expect(parseFloat(requestBody.daysRequested)).toBe(2);
    ids.requests.push(requestBody.id);

    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const listed = await getHolidays();
    expect(listed.status).toBe(200);
    const listBody = await listed.json();
    expect(listBody.holidays.some((row: { id: number }) => row.id === holidayId)).toBe(true);

    const deleted = await deleteHoliday(
      new NextRequest(`http://localhost/api/holidays/${holidayId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: String(holidayId) }) }
    );
    expect(deleted.status).toBe(200);
    ids.holidays = ids.holidays.filter((id) => id !== holidayId);
  });

  test("rejects oversized time-off spans before holiday expansion", async () => {
    session({ email: worker.email, employeeId: worker.id, role: "employee" });
    const res = await createSessionTimeOff(
      new NextRequest("http://localhost/api/time-off/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policyId: policy.id,
          startDate: "2020-01-01",
          endDate: "2030-01-01",
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot exceed/i);
  });
});
