import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvalWorkflowSteps, employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const workflowId = parseInt(resolvedParams.id, 10);

    // Check permissions
    const [currentEmployee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
      .limit(1);

    if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const data = await request.json();
    const { stepOrder, approverRole, approverId, requiredCount } = data;

    const [step] = await db
      .insert(approvalWorkflowSteps)
      .values({
        workflowId,
        stepOrder,
        approverRole,
        requiredCount: requiredCount || 1,
      })
      .returning();

    return NextResponse.json({ step });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to create workflow step:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create workflow step", message: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const workflowId = parseInt(resolvedParams.id, 10);

    const steps = await db
      .select()
      .from(approvalWorkflowSteps)
      .where(eq(approvalWorkflowSteps.workflowId, workflowId))
      .orderBy(approvalWorkflowSteps.stepOrder);

    return NextResponse.json({ steps });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to fetch workflow steps:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch workflow steps", message: errorMessage },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const workflowId = parseInt(resolvedParams.id, 10);

    // Check permissions
    const [currentEmployee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
      .limit(1);

    if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const stepId = searchParams.get("stepId");

    if (!stepId) {
      return NextResponse.json({ error: "Step ID required" }, { status: 400 });
    }

    await db
      .delete(approvalWorkflowSteps)
      .where(
        and(
          eq(approvalWorkflowSteps.id, parseInt(stepId, 10)),
          eq(approvalWorkflowSteps.workflowId, workflowId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to delete workflow step:", errorMessage);
    return NextResponse.json(
      { error: "Failed to delete workflow step", message: errorMessage },
      { status: 500 }
    );
  }
}
