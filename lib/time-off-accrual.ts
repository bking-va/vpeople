import { db } from "@/lib/db";
import {
  timeOffBalances,
  timeOffPolicies,
  timeOffAccrualRuns,
  timeOffBalanceAdjustments,
  employees,
} from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  accrualPeriodKey,
  accrualAmount,
  legacyBiweeklyPeriodKeys,
} from "@/lib/time-off-accrual-period";

export { accrualPeriodKey, accrualAmount } from "@/lib/time-off-accrual-period";

export async function runTimeOffAccruals(asOf: Date = new Date()) {
  let balancesProcessed = 0;
  let skippedAlreadyApplied = 0;
  let totalAccrued = 0;

  // Join each balance to its own policy so the amount never comes from a
  // different policy than the row being credited.
  const rows = await db
    .select({
      id: timeOffBalances.id,
      employeeId: timeOffBalances.employeeId,
      balance: timeOffBalances.balance,
      policyId: timeOffBalances.policyId,
      accrualRate: timeOffPolicies.accrualRate,
      accrualPeriod: timeOffPolicies.accrualPeriod,
      maxBalance: timeOffPolicies.maxBalance,
    })
    .from(timeOffBalances)
    .innerJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .innerJoin(employees, eq(timeOffBalances.employeeId, employees.id))
    .where(sql`${employees.employmentStatus} <> 'terminated'`);

  for (const row of rows) {
    const periodKey = accrualPeriodKey(row.accrualPeriod, asOf);
    if (!periodKey) continue;

    if (row.accrualPeriod === "biweekly") {
      const legacyKeys = legacyBiweeklyPeriodKeys(asOf);
      const already = await db
        .select({ id: timeOffAccrualRuns.id })
        .from(timeOffAccrualRuns)
        .where(
          and(
            eq(timeOffAccrualRuns.balanceId, row.id),
            inArray(timeOffAccrualRuns.periodKey, legacyKeys)
          )
        )
        .limit(1);
      if (already.length > 0) {
        skippedAlreadyApplied += 1;
        continue;
      }
    }

    const rate = parseFloat(row.accrualRate || "0");
    const amount = accrualAmount(rate, row.accrualPeriod);
    if (amount <= 0) continue;

    const current = parseFloat(row.balance);
    const maxBalance = row.maxBalance ? parseFloat(row.maxBalance) : null;
    const uncapped = current + amount;
    const next = maxBalance !== null ? Math.min(uncapped, maxBalance) : uncapped;
    const applied = Number((next - current).toFixed(2));
    if (applied <= 0) {
      continue;
    }

    const appliedThis = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(timeOffAccrualRuns)
        .values({
          balanceId: row.id,
          periodKey,
          amount: applied.toFixed(2),
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        return null;
      }

      await tx
        .update(timeOffBalances)
        .set({
          balance: next.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(timeOffBalances.id, row.id));

      await tx.insert(timeOffBalanceAdjustments).values({
        balanceId: row.id,
        amount: applied.toFixed(2),
        reason: `accrual:${periodKey}`,
        adjustedBy: row.employeeId,
      });

      return applied;
    });

    if (appliedThis === null) {
      skippedAlreadyApplied += 1;
      continue;
    }

    balancesProcessed += 1;
    totalAccrued += appliedThis;
  }

  return {
    balancesProcessed,
    skippedAlreadyApplied,
    totalAccrued: Number(totalAccrued.toFixed(2)),
    asOf: asOf.toISOString(),
  };
}
