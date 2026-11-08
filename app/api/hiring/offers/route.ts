import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { offerLetters } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();

    const [offer] = await db
      .insert(offerLetters)
      .values({
        candidateId: data.candidateId,
        jobTitle: data.jobTitle,
        salary: data.salary,
        startDate: data.startDate,
      })
      .returning();

    return NextResponse.json(offer);
  } catch (error: any) {
    console.error("Failed to create offer:", error);
    return NextResponse.json(
      { error: "Failed to create offer", message: error.message },
      { status: 500 }
    );
  }
}
