import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and } from "drizzle-orm";
import {
  employees,
  timeOffPolicies,
  timeOffBalances,
  timeOffAccrualRuns,
  timeOffBalanceAdjustments,
} from "@/lib/db/schema";
import { runTimeOffAccruals } from "@/lib/time-off-accrual";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {
  schema: {
    employees,
    timeOffPolicies,
    timeOffBalances,
    timeOffAccrualRuns,
    timeOffBalanceAdjustments,
  },
});

describe("Time-off accrual scheduler (Real Postgres)", () => {
  let policy: any;
  let employee: any;
  let balance: any;

  beforeAll(async () => {
    const testRunId = Date.now();
    const [p] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Accrual Policy ${testRunId}`,
        policyType: "vacation",
        accrualRate: "1.25",
        accrualPeriod: "monthly",
        maxBalance: "30",
      })
      .returning();
    policy = p;

    const [e] = await db
      .insert(employees)
      .values({
        employeeNumber: `ACC_${testRunId}`,
        firstName: "Accrue",
        lastName: "Me",
        email: `accrue.me.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    employee = e;

    const [b] = await db
      .insert(timeOffBalances)
      .values({
        employeeId: e.id,
        policyId: p.id,
        balance: "10.00",
      })
      .returning();
    balance = b;
  });

  afterAll(async () => {
    try {
      if (balance?.id) {
        await db.delete(timeOffAccrualRuns).where(eq(timeOffAccrualRuns.balanceId, balance.id));
        await db.delete(timeOffBalanceAdjustments).where(eq(timeOffBalanceAdjustments.balanceId, balance.id));
        await db.delete(timeOffBalances).where(eq(timeOffBalances.id, balance.id));
      }
      if (employee?.id) await db.delete(employees).where(eq(employees.id, employee.id));
      if (policy?.id) await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, policy.id));
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("applies accrual once per period and is idempotent on rerun", async () => {
    const asOf = new Date("2027-04-15T12:00:00Z");
    const first = await runTimeOffAccruals(asOf);
    expect(first.balancesProcessed).toBeGreaterThanOrEqual(1);

    const [afterFirst] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(afterFirst.balance)).toBeCloseTo(11.25, 2);

    const second = await runTimeOffAccruals(asOf);
    expect(second.skippedAlreadyApplied).toBeGreaterThanOrEqual(1);

    const [afterSecond] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.id, balance.id));
    expect(parseFloat(afterSecond.balance)).toBeCloseTo(11.25, 2);

    const runs = await db
      .select()
      .from(timeOffAccrualRuns)
      .where(
        and(
          eq(timeOffAccrualRuns.balanceId, balance.id),
          eq(timeOffAccrualRuns.periodKey, "2027-04")
        )
      );
    expect(runs.length).toBe(1);
  });

  test("each balance uses its own policy rate when two policies differ", async () => {
    const testRunId = Date.now();
    const [vacation] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Vacation Canada ${testRunId}`,
        policyType: "vacation",
        accrualRate: "15",
        accrualPeriod: "annual",
      })
      .returning();
    const [sick] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Sick All ${testRunId}`,
        policyType: "sick",
        accrualRate: "10",
        accrualPeriod: "annual",
      })
      .returning();
    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `ACC2_${testRunId}`,
        firstName: "Two",
        lastName: "Policies",
        email: `two.policies.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    const [vacBal] = await db
      .insert(timeOffBalances)
      .values({ employeeId: emp.id, policyId: vacation.id, balance: "0.00" })
      .returning();
    const [sickBal] = await db
      .insert(timeOffBalances)
      .values({ employeeId: emp.id, policyId: sick.id, balance: "0.00" })
      .returning();

    try {
      await runTimeOffAccruals(new Date("2028-06-15T12:00:00Z"));
      const [vacationAfter] = await db
        .select()
        .from(timeOffBalances)
        .where(eq(timeOffBalances.id, vacBal.id));
      const [sickAfter] = await db
        .select()
        .from(timeOffBalances)
        .where(eq(timeOffBalances.id, sickBal.id));
      expect(parseFloat(vacationAfter.balance)).toBeCloseTo(15, 2);
      expect(parseFloat(sickAfter.balance)).toBeCloseTo(10, 2);
    } finally {
      await db.delete(timeOffAccrualRuns).where(eq(timeOffAccrualRuns.balanceId, vacBal.id));
      await db.delete(timeOffAccrualRuns).where(eq(timeOffAccrualRuns.balanceId, sickBal.id));
      await db.delete(timeOffBalanceAdjustments).where(eq(timeOffBalanceAdjustments.balanceId, vacBal.id));
      await db.delete(timeOffBalanceAdjustments).where(eq(timeOffBalanceAdjustments.balanceId, sickBal.id));
      await db.delete(timeOffBalances).where(eq(timeOffBalances.id, vacBal.id));
      await db.delete(timeOffBalances).where(eq(timeOffBalances.id, sickBal.id));
      await db.delete(employees).where(eq(employees.id, emp.id));
      await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, vacation.id));
      await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, sick.id));
    }
  });
});
