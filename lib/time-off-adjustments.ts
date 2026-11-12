import { timeOffBalanceAdjustments, timeOffBalances } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

export function parseAdjustmentAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

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

export async function applyManualBalanceAdjustment(
  executor: {
    select: (...args: any[]) => any;
    insert: (...args: any[]) => any;
    update: (...args: any[]) => any;
  },
  opts: {
    employeeId: number;
    policyId: number;
    amount: number;
    reason: string;
    adjustedBy: number;
  }
) {
  const reason = opts.reason.trim();
  if (!reason) {
    throw new Error("Reason is required");
  }
  const amount = parseAdjustmentAmount(opts.amount);
  if (amount == null) {
    throw new Error("Amount must be a non-zero number");
  }

  const [balance] = await executor
    .select({
      id: timeOffBalances.id,
      balance: timeOffBalances.balance,
    })
    .from(timeOffBalances)
    .where(
      and(
        eq(timeOffBalances.employeeId, opts.employeeId),
        eq(timeOffBalances.policyId, opts.policyId)
      )
    )
    .limit(1);

  if (!balance) {
    return { notFound: true as const };
  }

  const [ledger] = await executor
    .insert(timeOffBalanceAdjustments)
    .values({
      balanceId: balance.id,
      amount: amount.toFixed(2),
      reason,
      adjustedBy: opts.adjustedBy,
    })
    .returning();

  await executor
    .update(timeOffBalances)
    .set({
      balance: sql`${timeOffBalances.balance} + ${amount}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(timeOffBalances.id, balance.id));

  return {
    notFound: false as const,
    ledger,
    previousBalance: balance.balance,
  };
}
