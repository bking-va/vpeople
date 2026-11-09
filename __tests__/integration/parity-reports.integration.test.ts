import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employees,
  departments,
  locations,
  compensationHistory,
  employmentStatusHistory,
  timeOffPolicies,
  timeOffBalances,
  timeOffRequests,
  timeOffAccrualRuns,
  timeOffBalanceAdjustments,
} from "@/lib/db/schema";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));
jest.mock("@/lib/permissions", () => ({
  getUserPermissions: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { getUserPermissions } from "@/lib/permissions";
import { runTimeOffCarryover } from "@/lib/time-off-carryover";
import { runTimeOffAccruals } from "@/lib/time-off-accrual";
import { recordEmploymentStatusChange } from "@/lib/employment-status";
import {
  getPayByTitleReport,
  getPayByDepartmentReport,
  getPayByLocationReport,
  getSalaryHistoryReport,
  getTimeOffScheduleReport,
  getEmploymentStatusHistoryReport,
} from "@/lib/reports/standard";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedPermissions = getUserPermissions as jest.MockedFunction<typeof getUserPermissions>;
const cronSecret = process.env.CRON_SECRET || "parity-cron-secret";
process.env.CRON_SECRET = cronSecret;
const cronAuth = { authorization: `Bearer ${cronSecret}` };

function grantCompensation(allowed: boolean) {
  mockedAuth.mockResolvedValue({
    user: { email: "parity.hr@test.com", role: "admin" },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as any);
  mockedPermissions.mockResolvedValue({ canViewCompensation: allowed } as any);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {
  schema: {
    employees,
    departments,
    locations,
    compensationHistory,
    employmentStatusHistory,
    timeOffPolicies,
    timeOffBalances,
    timeOffRequests,
    timeOffAccrualRuns,
    timeOffBalanceAdjustments,
  },
});

describe("PARITY reports, carryover, and status history (Real Postgres)", () => {
  const runId = Date.now();
  const ids = {
    employees: [] as number[],
    departments: [] as number[],
    locations: [] as number[],
    policies: [] as number[],
    balances: [] as number[],
    requests: [] as number[],
    compensation: [] as number[],
    status: [] as number[],
  };

  afterAll(async () => {
    try {
      for (const id of ids.requests) await db.delete(timeOffRequests).where(eq(timeOffRequests.id, id));
      for (const id of ids.balances) {
        await db.delete(timeOffAccrualRuns).where(eq(timeOffAccrualRuns.balanceId, id));
        await db.delete(timeOffBalanceAdjustments).where(eq(timeOffBalanceAdjustments.balanceId, id));
        await db.delete(timeOffBalances).where(eq(timeOffBalances.id, id));
      }
      for (const id of ids.policies) await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, id));
      for (const id of ids.compensation) {
        await db.delete(compensationHistory).where(eq(compensationHistory.id, id));
      }
      for (const id of ids.status) {
        await db.delete(employmentStatusHistory).where(eq(employmentStatusHistory.id, id));
      }
      for (const id of ids.employees) {
        await db.delete(employmentStatusHistory).where(eq(employmentStatusHistory.employeeId, id));
        await db.delete(compensationHistory).where(eq(compensationHistory.employeeId, id));
        await db.delete(employees).where(eq(employees.id, id));
      }
      for (const id of ids.departments) await db.delete(departments).where(eq(departments.id, id));
      for (const id of ids.locations) await db.delete(locations).where(eq(locations.id, id));
    } catch (error) {
      console.error("Parity cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("carryover forfeits above max then annual accrual credits the new year", async () => {
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Parity Carry ${runId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "annual",
        maxCarryover: "5",
      })
      .returning();
    ids.policies.push(policy.id);

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_CO_${runId}`,
        firstName: "Carry",
        lastName: "Over",
        email: `carry.over.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    ids.employees.push(emp.id);

    const [balance] = await db
      .insert(timeOffBalances)
      .values({ employeeId: emp.id, policyId: policy.id, balance: "20.00" })
      .returning();
    ids.balances.push(balance.id);

    const asOf = new Date("2029-01-02T12:00:00Z");
    const first = await runTimeOffCarryover(asOf, cronAuth);
    expect(first.balancesProcessed).toBeGreaterThanOrEqual(1);

    const [afterCarry] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(afterCarry.balance)).toBeCloseTo(5, 2);

    const second = await runTimeOffCarryover(asOf, cronAuth);
    expect(second.skippedAlreadyApplied).toBeGreaterThanOrEqual(1);

    const [still] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(still.balance)).toBeCloseTo(5, 2);

    await runTimeOffAccruals(asOf);
    const [afterAccrual] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(afterAccrual.balance)).toBeCloseTo(15, 2);

    const history = await db
      .select()
      .from(timeOffBalanceAdjustments)
      .where(eq(timeOffBalanceAdjustments.balanceId, balance.id));
    expect(history.some((row) => row.reason === "carryover:2028")).toBe(true);
    expect(history.some((row) => row.reason === "accrual:2029")).toBe(true);
  });

  test("unlimited maxCarryover does not forfeit leftover days", async () => {
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Parity Unlimited ${runId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "annual",
        maxCarryover: null,
      })
      .returning();
    ids.policies.push(policy.id);

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_UN_${runId}`,
        firstName: "No",
        lastName: "Cap",
        email: `no.cap.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    ids.employees.push(emp.id);

    const [balance] = await db
      .insert(timeOffBalances)
      .values({ employeeId: emp.id, policyId: policy.id, balance: "22.00" })
      .returning();
    ids.balances.push(balance.id);

    await runTimeOffCarryover(new Date("2029-01-02T12:00:00Z"), cronAuth);
    const [after] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(after.balance)).toBeCloseTo(22, 2);
  });

  test("January carryover after this year's accrual does not forfeit YTD credits", async () => {
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Parity YTD ${runId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "annual",
        maxCarryover: "5",
      })
      .returning();
    ids.policies.push(policy.id);

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_YTD_${runId}`,
        firstName: "Year",
        lastName: "ToDate",
        email: `ytd.carry.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    ids.employees.push(emp.id);

    const [balance] = await db
      .insert(timeOffBalances)
      .values({ employeeId: emp.id, policyId: policy.id, balance: "30.00" })
      .returning();
    ids.balances.push(balance.id);

    await db.insert(timeOffAccrualRuns).values({
      balanceId: balance.id,
      periodKey: "2029",
      amount: "10.00",
      createdAt: new Date("2029-01-01T00:05:00Z"),
    });

    await runTimeOffCarryover(new Date("2029-01-15T12:00:00Z"), cronAuth);
    const [after] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(after.balance)).toBeCloseTo(15, 2);
  });

  test("mid-year cron does not apply last year's carryover cap", async () => {
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Parity Mid ${runId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "annual",
        maxCarryover: "5",
      })
      .returning();
    ids.policies.push(policy.id);

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_MID_${runId}`,
        firstName: "Mid",
        lastName: "Year",
        email: `mid.year.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    ids.employees.push(emp.id);

    const [balance] = await db
      .insert(timeOffBalances)
      .values({ employeeId: emp.id, policyId: policy.id, balance: "20.00" })
      .returning();
    ids.balances.push(balance.id);

    const result = await runTimeOffCarryover(new Date("2029-11-15T12:00:00Z"), cronAuth);
    expect(result.balancesProcessed).toBe(0);
    const [after] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(after.balance)).toBeCloseTo(20, 2);
  });

  test("carryover without cron authorization does not forfeit leave", async () => {
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Parity Unauth ${runId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "annual",
        maxCarryover: "5",
      })
      .returning();
    ids.policies.push(policy.id);
    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_NOAUTH_${runId}`,
        firstName: "No",
        lastName: "Auth",
        email: `no.auth.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    ids.employees.push(emp.id);
    const [balance] = await db
      .insert(timeOffBalances)
      .values({ employeeId: emp.id, policyId: policy.id, balance: "20.00" })
      .returning();
    ids.balances.push(balance.id);

    const result = await runTimeOffCarryover(new Date("2029-01-02T12:00:00Z"));
    expect(result.skipped).toBe("unauthorized");
    const [after] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(after.balance)).toBeCloseTo(20, 2);
  });

  test("pay by title/dept/location aggregates current salaries", async () => {
    const title = `Parity Eng ${runId}`;
    const [dept] = await db
      .insert(departments)
      .values({ name: `Parity Dept ${runId}` })
      .returning();
    ids.departments.push(dept.id);
    const [loc] = await db
      .insert(locations)
      .values({ name: `Parity Loc ${runId}`, country: "CA" })
      .returning();
    ids.locations.push(loc.id);

    const [a] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_A_${runId}`,
        firstName: "Pay",
        lastName: "One",
        email: `pay.one.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        jobTitle: title,
        departmentId: dept.id,
        locationId: loc.id,
      })
      .returning();
    const [b] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_B_${runId}`,
        firstName: "Pay",
        lastName: "Two",
        email: `pay.two.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        jobTitle: title,
        departmentId: dept.id,
        locationId: loc.id,
      })
      .returning();
    ids.employees.push(a.id, b.id);

    const [c1] = await db
      .insert(compensationHistory)
      .values({
        employeeId: a.id,
        effectiveDate: "2024-01-01",
        payRate: "100000",
        payType: "salary",
        currency: "CAD",
        changeReason: "Hire",
      })
      .returning();
    const [c2] = await db
      .insert(compensationHistory)
      .values({
        employeeId: b.id,
        effectiveDate: "2025-01-01",
        payRate: "200000",
        payType: "salary",
        currency: "CAD",
        changeReason: "Hire",
      })
      .returning();
    const [future] = await db
      .insert(compensationHistory)
      .values({
        employeeId: a.id,
        effectiveDate: "2099-01-01",
        payRate: "999999",
        payType: "salary",
        currency: "CAD",
        changeReason: "Scheduled raise",
      })
      .returning();
    ids.compensation.push(c1.id, c2.id, future.id);

    grantCompensation(false);
    const denied = await getPayByTitleReport();
    expect(denied).toEqual([]);
    expect(await getSalaryHistoryReport()).toEqual([]);

    grantCompensation(true);
    const byTitle = await getPayByTitleReport();
    const titleRow = byTitle.find((row) => row.group.startsWith(title));
    expect(titleRow).toBeDefined();
    expect(titleRow!.count).toBe(2);
    expect(titleRow!.avgPay).toBeCloseTo(150000, 2);
    expect(titleRow!.minPay).toBeCloseTo(100000, 2);
    expect(titleRow!.maxPay).toBeCloseTo(200000, 2);
    expect(titleRow!.currency).toBe("CAD");
    expect(titleRow!.payType).toBe("salary");

    const byDept = await getPayByDepartmentReport();
    expect(byDept.find((row) => row.group.startsWith(dept.name))?.avgPay).toBeCloseTo(150000, 2);

    const byLoc = await getPayByLocationReport();
    expect(byLoc.find((row) => row.group.startsWith(loc.name))?.avgPay).toBeCloseTo(150000, 2);

    const history = await getSalaryHistoryReport();
    expect(
      history.some((row) => row.id === c2.id && parseFloat(row.payRate || "0") === 200000)
    ).toBe(true);
  });

  test("time-off schedule includes overlapping pending and approved leave", async () => {
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Parity Sched ${runId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "annual",
      })
      .returning();
    ids.policies.push(policy.id);

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_SCH_${runId}`,
        firstName: "Sched",
        lastName: "Ule",
        email: `sched.ule.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    ids.employees.push(emp.id);

    const [req] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: emp.id,
        policyId: policy.id,
        startDate: "2029-06-10",
        endDate: "2029-06-12",
        daysRequested: "3",
        status: "approved",
      })
      .returning();
    ids.requests.push(req.id);

    const rows = await getTimeOffScheduleReport(2029);
    expect(rows.some((row) => row.id === req.id && row.status === "approved")).toBe(true);
  });

  test("employment status history is effective-dated", async () => {
    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `PAR_ST_${runId}`,
        firstName: "Status",
        lastName: "Hist",
        email: `status.hist.${runId}@test.com`,
        hireDate: "2021-03-01",
        employmentStatus: "full_time",
      })
      .returning();
    ids.employees.push(emp.id);

    await recordEmploymentStatusChange({
      employeeId: emp.id,
      status: "full_time",
      effectiveDate: "2021-03-01",
      comment: "Hire",
    });
    await recordEmploymentStatusChange({
      employeeId: emp.id,
      status: "on_leave",
      effectiveDate: "2026-02-01",
      comment: "Leave",
    });

    const rows = await getEmploymentStatusHistoryReport();
    const mine = rows.filter((row) => row.employeeId === emp.id);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.some((row) => row.employmentStatus === "on_leave" && row.effectiveDate === "2026-02-01")).toBe(
      true
    );
    expect(mine.some((row) => row.comment === "Hire")).toBe(true);
  });
});
