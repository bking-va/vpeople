import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeOffPolicies, timeOffBalances } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.employeeId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const policyId = parseInt(params.id);
    
    const [policy] = await db
      .select()
      .from(timeOffPolicies)
      .where(eq(timeOffPolicies.id, policyId))
      .limit(1);

    if (!policy) {
      return NextResponse.json(
        { error: "Policy not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ policy });
  } catch (error: any) {
    console.error("Failed to fetch time-off policy:", error);
    return NextResponse.json(
      { error: "Failed to fetch policy", message: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.employeeId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user is full_admin
    if (session.user.role !== "full_admin") {
      return NextResponse.json(
        { error: "Only full admins can update time-off policies" },
        { status: 403 }
      );
    }

    const policyId = parseInt(params.id);
    const body = await request.json();
    const {
      name,
      policyType,
      country,
      accrualRate,
      accrualPeriod,
      maxCarryover,
      maxBalance,
      requiresApproval,
      description,
    } = body;

    const [policy] = await db
      .update(timeOffPolicies)
      .set({
        name,
        policyType,
        country,
        accrualRate: accrualRate !== undefined ? String(accrualRate) : undefined,
        accrualPeriod,
        maxCarryover: maxCarryover !== undefined ? String(maxCarryover) : undefined,
        maxBalance: maxBalance !== undefined ? String(maxBalance) : undefined,
        requiresApproval,
        description,
        updatedAt: new Date(),
      })
      .where(eq(timeOffPolicies.id, policyId))
      .returning();

    if (!policy) {
      return NextResponse.json(
        { error: "Policy not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ policy });
  } catch (error: any) {
    console.error("Failed to update time-off policy:", error);
    return NextResponse.json(
      { error: "Failed to update policy", message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.employeeId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user is full_admin
    if (session.user.role !== "full_admin") {
      return NextResponse.json(
        { error: "Only full admins can delete time-off policies" },
        { status: 403 }
      );
    }

    const policyId = parseInt(params.id);

    // Check if any balances reference this policy
    const balances = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.policyId, policyId))
      .limit(1);

    if (balances.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete policy that has active balances. Remove balances first." },
        { status: 400 }
      );
    }

    await db
      .delete(timeOffPolicies)
      .where(eq(timeOffPolicies.id, policyId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete time-off policy:", error);
    return NextResponse.json(
      { error: "Failed to delete policy", message: error.message },
      { status: 500 }
    );
  }
}
