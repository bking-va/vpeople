import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { candidateNotes } from "@/lib/db/schema";
import { hiringAccessForCandidate } from "@/lib/hiring-access";

export async function POST(
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
    const candidateId = parseInt(idStr);

    const access = await hiringAccessForCandidate(session.user.email!, candidateId);
    if (access.notFound) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (!access.allowed || !access.employee) {
      return NextResponse.json(
        { error: "Forbidden", message: "Hiring team or admin access required" },
        { status: 403 }
      );
    }
    const employee = access.employee;

    const [note] = await db
      .insert(candidateNotes)
      .values({
        candidateId,
        authorId: employee.id,
        content: data.content,
      })
      .returning();

    return NextResponse.json(note);
  } catch (error: any) {
    console.error("Failed to create note:", error);
    return NextResponse.json(
      { error: "Failed to create note", message: error.message },
      { status: 500 }
    );
  }
}
