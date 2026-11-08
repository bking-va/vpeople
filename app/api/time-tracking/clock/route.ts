import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeClocks, employees } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    const data = await request.json();
    const action = data.action; // "in" or "out"

    if (action === "in") {
      // Check if already clocked in
      const [existing] = await db
        .select()
        .from(timeClocks)
        .where(
          and(
            eq(timeClocks.employeeId, employee.id),
            isNull(timeClocks.clockOut)
          )
        )
        .limit(1);

      if (existing) {
        return NextResponse.json(
          { error: "Already clocked in" },
          { status: 400 }
        );
      }

      // Clock in
      const [clockEntry] = await db
        .insert(timeClocks)
        .values({
          employeeId: employee.id,
          clockIn: new Date(),
        })
        .returning();

      return NextResponse.json({ clockEntry });
    } else if (action === "out") {
      // Find active clock entry
      const [existing] = await db
        .select()
        .from(timeClocks)
        .where(
          and(
            eq(timeClocks.employeeId, employee.id),
            isNull(timeClocks.clockOut)
          )
        )
        .limit(1);

      if (!existing) {
        return NextResponse.json(
          { error: "No active clock entry found" },
          { status: 400 }
        );
      }

      // Clock out
      const [updated] = await db
        .update(timeClocks)
        .set({
          clockOut: new Date(),
          breakMinutes: data.breakMinutes || 0,
          notes: data.notes || null,
          updatedAt: new Date(),
        })
        .where(eq(timeClocks.id, existing.id))
        .returning();

      return NextResponse.json({ clockEntry: updated });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Must be 'in' or 'out'" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Clock action failed:", error);
    return NextResponse.json(
      { error: "Clock action failed", message: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    const data = await request.json();
    const { clockId, breakMinutes } = data;

    if (!clockId || breakMinutes === undefined) {
      return NextResponse.json(
        { error: "Clock ID and break minutes required" },
        { status: 400 }
      );
    }

    // Update break minutes on the clock entry
    const [updated] = await db
      .update(timeClocks)
      .set({
        breakMinutes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timeClocks.id, clockId),
          eq(timeClocks.employeeId, employee.id)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Clock entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ clockEntry: updated });
  } catch (error: any) {
    console.error("Failed to update break time:", error);
    return NextResponse.json(
      { error: "Update failed", message: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    // Get current clock status
    const [current] = await db
      .select()
      .from(timeClocks)
      .where(
        and(
          eq(timeClocks.employeeId, employee.id),
          isNull(timeClocks.clockOut)
        )
      )
      .limit(1);

    return NextResponse.json({ currentClock: current || null });
  } catch (error: any) {
    console.error("Failed to get clock status:", error);
    return NextResponse.json(
      { error: "Failed to get status", message: error.message },
      { status: 500 }
    );
  }
}
