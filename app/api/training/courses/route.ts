import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { trainingCourses } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const courses = await db.select().from(trainingCourses);
    return NextResponse.json({ courses });
  } catch (error: any) {
    console.error("Failed to fetch courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses", message: error.message },
      { status: 500 }
    );
  }
}
