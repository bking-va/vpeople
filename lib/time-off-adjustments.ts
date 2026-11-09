import { timeOffBalanceAdjustments, timeOffBalances } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function recordTimeOffUsageAdjustment(
  executor: {
    select: (...args: any[]) => any;
    insert: (...args: any[]) => any;
  },
  opts: {
    employeeId: number;
    policyId: number;
    daysRequested: number;
    requestId: number;
    adjustedBy: number;
  }
) {
  const [balance] = await executor
    .select({ id: timeOffBalances.id })
    .from(timeOffBalances)
    .where(
      and(
        eq(timeOffBalances.employeeId, opts.employeeId),
        eq(timeOffBalances.policyId, opts.policyId)
      )
    )
    .limit(1);

  if (!balance) return;

  await executor.insert(timeOffBalanceAdjustments).values({
    balanceId: balance.id,
    amount: (-opts.daysRequested).toFixed(2),
    reason: `used:${opts.requestId}`,
    adjustedBy: opts.adjustedBy,
  });
}
