import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobOpenings } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();

    const [opening] = await db
      .insert(jobOpenings)
      .values({
        title: data.title,
        departmentId: data.departmentId || null,
        locationId: data.locationId || null,
        hiringLeadId: data.hiringLeadId || null,
        status: data.status || "draft",
        employmentType: data.employmentType,
        description: data.description || null,
        requirements: data.requirements || null,
        openDate: data.openDate || null,
      })
      .returning();

    return NextResponse.json(opening);
  } catch (error: any) {
    console.error("Failed to create job opening:", error);
    return NextResponse.json(
      { error: "Failed to create job opening", message: error.message },
      { status: 500 }
    );
  }
}
