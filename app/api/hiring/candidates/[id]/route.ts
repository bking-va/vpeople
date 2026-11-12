import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { candidates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { clampCandidateRating } from "@/lib/authz";
import { hiringAccessForCandidate } from "@/lib/hiring-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const access = await hiringAccessForCandidate(session.user.email, id);
  if (access.notFound) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Forbidden", message: "Hiring team or admin access required" },
      { status: 403 }
    );
  }

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  return NextResponse.json({ candidate });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { id: idStr } = await params;
    const id = parseInt(idStr);

    const access = await hiringAccessForCandidate(session.user.email, id);
    if (access.notFound) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (!access.allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Hiring team or admin access required" },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    
    if (data.stage !== undefined) {
      updateData.stage = data.stage;
    }
    if (data.rating !== undefined) {
      updateData.rating = clampCandidateRating(data.rating);
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
