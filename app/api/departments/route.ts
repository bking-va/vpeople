import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { departments } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const depts = await db.select().from(departments);
    return NextResponse.json({ departments: depts });
  } catch (error: any) {
    console.error("Failed to fetch departments:", error);
    return NextResponse.json(
      { error: "Failed to fetch departments", message: error.message },
      { status: 500 }
    );
  }
}
