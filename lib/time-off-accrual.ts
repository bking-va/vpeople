import { db } from "@/lib/db";
import {
  timeOffBalances,
  timeOffPolicies,
  timeOffAccrualRuns,
  timeOffBalanceAdjustments,
  employees,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { accrualPeriodKey, accrualAmount } from "@/lib/time-off-accrual-period";

export { accrualPeriodKey, accrualAmount } from "@/lib/time-off-accrual-period";

export async function runTimeOffAccruals(asOf: Date = new Date()) {
  const policies = await db.select().from(timeOffPolicies);
  let balancesProcessed = 0;
  let skippedAlreadyApplied = 0;
  let totalAccrued = 0;

  for (const policy of policies) {
    const periodKey = accrualPeriodKey(policy.accrualPeriod, asOf);
    if (!periodKey) continue;

    const rate = parseFloat(policy.accrualRate || "0");
    const amount = accrualAmount(rate, policy.accrualPeriod);
    if (amount <= 0) continue;

    const balances = await db
      .select({
        id: timeOffBalances.id,
        employeeId: timeOffBalances.employeeId,
        balance: timeOffBalances.balance,
      })
      .from(timeOffBalances)
      .innerJoin(employees, eq(timeOffBalances.employeeId, employees.id))
      .where(
        and(
          eq(timeOffBalances.policyId, policy.id),
          sql`${employees.employmentStatus} <> 'terminated'`
        )
      );

    const maxBalance = policy.maxBalance ? parseFloat(policy.maxBalance) : null;

    for (const balance of balances) {
      const current = parseFloat(balance.balance);
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
            balanceId: balance.id,
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
          .where(eq(timeOffBalances.id, balance.id));

        await tx.insert(timeOffBalanceAdjustments).values({
          balanceId: balance.id,
          amount: applied.toFixed(2),
          reason: `accrual:${periodKey}`,
          adjustedBy: balance.employeeId,
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
  }

  return {
    balancesProcessed,
    skippedAlreadyApplied,
    totalAccrued: Number(totalAccrued.toFixed(2)),
    asOf: asOf.toISOString(),
  };
}
