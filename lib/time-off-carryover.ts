import { db } from "@/lib/db";
import {
  timeOffBalances,
  timeOffPolicies,
  timeOffAccrualRuns,
  timeOffBalanceAdjustments,
  employees,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { carryoverPeriodKey } from "@/lib/time-off-accrual-period";

/**
 * At the start of a calendar year, forfeit unused days above maxCarryover
 * for the year that just ended. Idempotent per (balance, carryover:YYYY).
 * Policies with a null maxCarryover are unlimited and skipped.
 */
export async function runTimeOffCarryover(asOf: Date = new Date()) {
  const periodKey = carryoverPeriodKey(asOf);
  let balancesProcessed = 0;
  let skippedAlreadyApplied = 0;
  let totalForfeited = 0;

  const rows = await db
    .select({
      id: timeOffBalances.id,
      employeeId: timeOffBalances.employeeId,
      balance: timeOffBalances.balance,
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

    const current = parseFloat(row.balance);
    const cap = parseFloat(row.maxCarryover);
    if (!Number.isFinite(cap) || cap < 0) continue;

    const next = Math.min(current, cap);
    const forfeited = Number((current - next).toFixed(2));

    const applied = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(timeOffAccrualRuns)
        .values({
          balanceId: row.id,
          periodKey,
          amount: (-forfeited).toFixed(2),
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        return null;
      }

      if (forfeited > 0) {
        await tx
          .update(timeOffBalances)
          .set({
            balance: next.toFixed(2),
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
