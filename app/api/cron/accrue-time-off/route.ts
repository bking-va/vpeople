import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeOffBalances, timeOffPolicies, employees } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("Starting monthly time-off accrual...");

  try {
    // Get all active policies
    const policies = await db.select().from(timeOffPolicies);

    let totalAccrued = 0;
    let employeesProcessed = 0;

    for (const policy of policies) {
      // Get all employees with this policy
      const balances = await db
        .select({
          id: timeOffBalances.id,
          employeeId: timeOffBalances.employeeId,
          balance: timeOffBalances.balance,
        })
        .from(timeOffBalances)
        .where(eq(timeOffBalances.policyId, policy.id));

      // Accrual logic: add monthly accrual to balance
      if (!policy.accrualRate) continue;
      const monthlyAccrual = parseFloat(policy.accrualRate) / 12; // Annual to monthly

      for (const balance of balances) {
        const newBalance = parseFloat(balance.balance) + monthlyAccrual;
        const cappedBalance = policy.maxBalance
          ? Math.min(newBalance, parseFloat(policy.maxBalance))
          : newBalance;

        await db
          .update(timeOffBalances)
          .set({
            balance: cappedBalance.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(timeOffBalances.id, balance.id));

        totalAccrued += monthlyAccrual;
        employeesProcessed++;
      }
    }

    console.log(
      `✅ Accrual complete: ${employeesProcessed} employees, ${totalAccrued.toFixed(2)} days accrued`
    );

    return NextResponse.json({
      success: true,
      employeesProcessed,
      totalAccrued: totalAccrued.toFixed(2),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("❌ Accrual failed:", error);
    return NextResponse.json(
      { error: "Accrual failed", message: error.message },
      { status: 500 }
    );
  }
}
