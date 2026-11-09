import { db } from "@/lib/db";
import {
  timeOffBalances,
  timeOffPolicies,
  timeOffAccrualRuns,
  timeOffBalanceAdjustments,
  employees,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { carryoverPeriodKey, isCarryoverWindow } from "@/lib/time-off-accrual-period";

/**
 * In January, forfeit unused days above maxCarryover for the year that just
 * ended. Idempotent per (balance, carryover:YYYY). Policies with a null
 * maxCarryover are unlimited and skipped. Mid-year runs are no-ops so a
 * November deploy cannot treat current-year balances as last year's leftover.
 */
export async function runTimeOffCarryover(asOf: Date = new Date()) {
  const periodKey = carryoverPeriodKey(asOf);
  if (!isCarryoverWindow(asOf)) {
    return {
      balancesProcessed: 0,
      skippedAlreadyApplied: 0,
      totalForfeited: 0,
      periodKey,
      skipped: "not_january" as const,
      asOf: asOf.toISOString(),
    };
  }

  let balancesProcessed = 0;
  let skippedAlreadyApplied = 0;
  let totalForfeited = 0;

  const rows = await db
    .select({
      id: timeOffBalances.id,
      employeeId: timeOffBalances.employeeId,
      maxCarryover: timeOffPolicies.maxCarryover,
    })
    .from(timeOffBalances)
    .innerJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .innerJoin(employees, eq(timeOffBalances.employeeId, employees.id))
    .where(sql`${employees.employmentStatus} <> 'terminated'`);

  for (const row of rows) {
    if (row.maxCarryover === null || row.maxCarryover === undefined) {
      continue;
    }

    const cap = parseFloat(row.maxCarryover);
    if (!Number.isFinite(cap) || cap < 0) continue;

    const applied = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT 1 FROM time_off_balances WHERE id = ${row.id} FOR UPDATE`
      );

      const inserted = await tx
        .insert(timeOffAccrualRuns)
        .values({
          balanceId: row.id,
          periodKey,
          amount: "0.00",
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        return null;
      }

      const [live] = await tx
        .select({ balance: timeOffBalances.balance })
        .from(timeOffBalances)
        .where(eq(timeOffBalances.id, row.id))
        .limit(1);

      const current = parseFloat(live?.balance || "0");
      const next = Math.min(current, cap);
      const forfeited = Number((current - next).toFixed(2));

      if (forfeited > 0) {
        await tx
          .update(timeOffAccrualRuns)
          .set({ amount: (-forfeited).toFixed(2) })
          .where(eq(timeOffAccrualRuns.id, inserted[0].id));

        await tx
          .update(timeOffBalances)
          .set({
            balance: sql`LEAST(${timeOffBalances.balance}::numeric, ${cap}::numeric)`,
            updatedAt: new Date(),
          })
          .where(eq(timeOffBalances.id, row.id));

        await tx.insert(timeOffBalanceAdjustments).values({
          balanceId: row.id,
          amount: (-forfeited).toFixed(2),
          reason: periodKey,
          adjustedBy: row.employeeId,
        });
      }

      return forfeited;
    });

    if (applied === null) {
      skippedAlreadyApplied += 1;
      continue;
    }

    balancesProcessed += 1;
    totalForfeited += applied;
  }

  return {
    balancesProcessed,
    skippedAlreadyApplied,
    totalForfeited: Number(totalForfeited.toFixed(2)),
    periodKey,
    asOf: asOf.toISOString(),
  };
}
