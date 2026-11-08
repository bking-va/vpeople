import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { offerLetters } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
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

    const [offer] = await db
      .update(offerLetters)
      .set({
        jobTitle: data.jobTitle,
        salary: data.salary,
        startDate: data.startDate,
        updatedAt: new Date(),
      })
      .where(eq(offerLetters.id, id))
      .returning();

    return NextResponse.json(offer);
  } catch (error: any) {
    console.error("Failed to update offer:", error);
    return NextResponse.json(
      { error: "Failed to update offer", message: error.message },
      { status: 500 }
    );
  }
}
