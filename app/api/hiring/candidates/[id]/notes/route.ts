import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { candidateNotes, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, session.user.email!))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

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
