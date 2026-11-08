import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const requestedEmployeeId = searchParams.get("employeeId");

    // Users can only see their own token
    if (
      !requestedEmployeeId ||
      parseInt(requestedEmployeeId, 10) !== session.user.employeeId
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [employee] = await db
      .select({ calendarToken: employees.calendarToken })
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
      .limit(1);

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json({ token: employee.calendarToken });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to fetch calendar token:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch calendar token", message: errorMessage },
      { status: 500 }
    );
  }
}
