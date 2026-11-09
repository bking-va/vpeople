import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { publicEmployeeDto, terminateEmployee } from "@/lib/lifecycle";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const targetEmployeeId = parseInt(resolvedParams.id, 10);
    const currentEmployeeId = session.user.employeeId;
    if (!currentEmployeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [currentEmployee] = await db
      .select({ id: employees.id, accessLevel: employees.accessLevel })
      .from(employees)
      .where(eq(employees.id, currentEmployeeId))
      .limit(1);

    if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const data = await request.json();
    const { terminationDate, terminationType, terminationReasonId, notes } = data;
    if (!terminationDate) {
      return NextResponse.json({ error: "Termination date is required" }, { status: 400 });
    }
    if (!terminationReasonId) {
      return NextResponse.json({ error: "Termination reason is required" }, { status: 400 });
    }

    const result = await terminateEmployee({
      employeeId: targetEmployeeId,
      actorId: currentEmployee.id,
      terminationDate,
      terminationType,
      terminationReasonId: terminationReasonId ? Number(terminationReasonId) : null,
      notes,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      employee: publicEmployeeDto(result.employee),
      roeCode: result.roeCode,
      terminationReason: result.reasonName,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to terminate employee:", errorMessage);
    return NextResponse.json(
      { error: "Failed to terminate employee", message: errorMessage },
      { status: 500 }
    );
  }
}
