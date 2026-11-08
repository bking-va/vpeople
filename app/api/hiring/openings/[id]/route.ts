import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobOpenings } from "@/lib/db/schema";
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

    const [opening] = await db
      .update(jobOpenings)
      .set({
        title: data.title,
        departmentId: data.departmentId || null,
        locationId: data.locationId || null,
        hiringLeadId: data.hiringLeadId || null,
        status: data.status,
        employmentType: data.employmentType,
        description: data.description || null,
        requirements: data.requirements || null,
        openDate: data.openDate || null,
        closeDate: data.closeDate || null,
        updatedAt: new Date(),
      })
      .where(eq(jobOpenings.id, id))
      .returning();

    return NextResponse.json(opening);
  } catch (error: any) {
    console.error("Failed to update job opening:", error);
    return NextResponse.json(
      { error: "Failed to update job opening", message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);

    await db.delete(jobOpenings).where(eq(jobOpenings.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete job opening:", error);
    return NextResponse.json(
      { error: "Failed to delete job opening", message: error.message },
      { status: 500 }
    );
  }
}
