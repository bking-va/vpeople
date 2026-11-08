import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvalWorkflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { id: idStr } = await params;
    const id = parseInt(idStr);

    const [workflow] = await db
      .update(approvalWorkflows)
      .set({
        enabled: data.enabled,
        updatedAt: new Date(),
      })
      .where(eq(approvalWorkflows.id, id))
      .returning();

    return NextResponse.json(workflow);
  } catch (error: any) {
    console.error("Failed to update workflow:", error);
    return NextResponse.json(
      { error: "Failed to update workflow", message: error.message },
      { status: 500 }
    );
  }
}
