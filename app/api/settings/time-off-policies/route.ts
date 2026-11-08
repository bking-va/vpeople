import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeOffPolicies } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.employeeId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const policies = await db
      .select()
      .from(timeOffPolicies)
      .orderBy(timeOffPolicies.name);

    return NextResponse.json({ policies });
  } catch (error: any) {
    console.error("Failed to fetch time-off policies:", error);
    return NextResponse.json(
      { error: "Failed to fetch policies", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
        { error: "Only full admins can create time-off policies" },
        { status: 403 }
      );
    }

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

    if (!name || !policyType) {
      return NextResponse.json(
        { error: "Name and policy type are required" },
        { status: 400 }
      );
    }

    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name,
        policyType,
        country,
        accrualRate: accrualRate ? String(accrualRate) : null,
        accrualPeriod,
        maxCarryover: maxCarryover ? String(maxCarryover) : null,
        maxBalance: maxBalance ? String(maxBalance) : null,
        requiresApproval: requiresApproval !== undefined ? requiresApproval : true,
        description,
      })
      .returning();

    return NextResponse.json({ policy }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create time-off policy:", error);
    return NextResponse.json(
      { error: "Failed to create policy", message: error.message },
      { status: 500 }
    );
  }
}
