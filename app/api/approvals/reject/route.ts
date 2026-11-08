import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rejectStep } from "@/lib/approvals";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { requestId, stepOrder, comments } = body;

    if (!requestId || stepOrder === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const [currentEmployee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
      .limit(1);

    if (!currentEmployee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    await rejectStep(
      requestId,
      stepOrder,
      currentEmployee.id,
      comments
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to reject request:", error);
    
    // Return 409 for already-processed steps
    if (error.message?.includes("already been processed")) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }
    
    // Return 403 for authorization errors
    if (
      error.message?.includes("not authorized") ||
      error.message?.includes("cannot approve") ||
      error.message?.includes("earlier steps are still pending") ||
      error.message?.includes("your own")
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to reject request", message: error.message },
      { status: 500 }
    );
  }
}
