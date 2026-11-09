import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { letterTemplates } from "@/lib/db/schema";
import { LETTER_MERGE_FIELDS } from "@/lib/letter-merge";

export async function GET() {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await db.select().from(letterTemplates);
  return NextResponse.json({
    templates,
    mergeFields: LETTER_MERGE_FIELDS,
  });
}
