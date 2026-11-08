import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export async function POST() {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Generate a secure random token (32 bytes = 64 hex characters)
    const token = randomBytes(32).toString("hex");

    // Update employee with new calendar token
    const [employee] = await db
      .update(employees)
      .set({ calendarToken: token })
      .where(eq(employees.id, session.user.employeeId))
      .returning();

    return NextResponse.json({ token: employee.calendarToken });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to generate calendar token:", errorMessage);
    return NextResponse.json(
      { error: "Failed to generate calendar token", message: errorMessage },
      { status: 500 }
    );
  }
}
