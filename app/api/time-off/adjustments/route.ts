import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, timeOffBalanceAdjustments, timeOffBalances, timeOffPolicies } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getUserPermissions } from "@/lib/permissions";
import { canManageTimeOffOperations } from "@/lib/authz";
import { employeeInScope, scopedEmployeeIds } from "@/lib/employee-scope";
import {
  applyManualBalanceAdjustment,
  parseAdjustmentAmount,
} from "@/lib/time-off-adjustments";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !session.user.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [actor] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.email);
  if (
    !canManageTimeOffOperations({
      accessLevel: actor.accessLevel,
      canManageUsers: permissions.canManageUsers,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = await scopedEmployeeIds({
    employeeId: actor.id,
    accessLevel: actor.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });

  const rows = await db
    .select({
      id: timeOffBalanceAdjustments.id,
      amount: timeOffBalanceAdjustments.amount,
      reason: timeOffBalanceAdjustments.reason,
      createdAt: timeOffBalanceAdjustments.createdAt,
      adjustedBy: timeOffBalanceAdjustments.adjustedBy,
      employeeId: timeOffBalances.employeeId,
      policyId: timeOffBalances.policyId,
      policyName: timeOffPolicies.name,
    })
    .from(timeOffBalanceAdjustments)
    .innerJoin(timeOffBalances, eq(timeOffBalanceAdjustments.balanceId, timeOffBalances.id))
    .leftJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .orderBy(desc(timeOffBalanceAdjustments.createdAt))
    .limit(100);

  return NextResponse.json({
    adjustments: rows.filter((row) => employeeInScope(row.employeeId, allowed)),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !session.user.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [actor] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getUserPermissions(session.user.email);
  if (
    !canManageTimeOffOperations({
      accessLevel: actor.accessLevel,
      canManageUsers: permissions.canManageUsers,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await request.json();
  const employeeId = parseInt(String(data.employeeId), 10);
  const policyId = parseInt(String(data.policyId), 10);
  const amount = parseAdjustmentAmount(data.amount);
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";

  if (!Number.isFinite(employeeId) || !Number.isFinite(policyId)) {
    return NextResponse.json({ error: "employeeId and policyId are required" }, { status: 400 });
  }
  if (amount == null) {
    return NextResponse.json({ error: "amount must be a non-zero number" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const allowed = await scopedEmployeeIds({
    employeeId: actor.id,
    accessLevel: actor.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });
  if (!employeeInScope(employeeId, allowed)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await db.transaction(async (tx) =>
      applyManualBalanceAdjustment(tx, {
        employeeId,
        policyId,
        amount,
        reason,
        adjustedBy: actor.id,
      })
    );
    if (result.notFound) {
      return NextResponse.json({ error: "Balance not found for this policy" }, { status: 404 });
    }
    return NextResponse.json({ adjustment: result.ledger }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
