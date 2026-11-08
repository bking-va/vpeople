import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { candidates } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  // Public endpoint - no auth required
  
  try {
    const data = await request.json();

    const [candidate] = await db
      .insert(candidates)
      .values({
        jobOpeningId: data.jobOpeningId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        source: data.source || "direct",
        stage: "new",
        appliedAt: new Date(),
      })
      .returning();

    return NextResponse.json(candidate);
  } catch (error: any) {
    console.error("Failed to submit application:", error);
    return NextResponse.json(
      { error: "Failed to submit application", message: error.message },
      { status: 500 }
    );
  }
}
