import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { candidates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { id: idStr } = await params;
    const id = parseInt(idStr);

    const updateData: any = { updatedAt: new Date() };
    
    if (data.stage !== undefined) {
      updateData.stage = data.stage;
    }
    if (data.rating !== undefined) {
      updateData.rating = data.rating;
    }

    const [candidate] = await db
      .update(candidates)
      .set(updateData)
      .where(eq(candidates.id, id))
      .returning();

    return NextResponse.json(candidate);
  } catch (error: any) {
    console.error("Failed to update candidate:", error);
    return NextResponse.json(
      { error: "Failed to update candidate", message: error.message },
      { status: 500 }
    );
  }
}
