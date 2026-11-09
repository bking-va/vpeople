import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { announcements, employees } from "@/lib/db/schema";
import { and, desc, eq, isNull, or, gte } from "drizzle-orm";
import { isFullAdmin } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const rows = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.isActive, true),
        or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now))
      )
    )
    .orderBy(desc(announcements.publishedAt));

  return NextResponse.json({ announcements: rows });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [actor] = await db
    .select({ accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!isFullAdmin(actor?.accessLevel)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  if (!body.title || !body.body) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  const [row] = await db
    .insert(announcements)
    .values({
      title: body.title,
      body: body.body,
      publishedById: session.user.employeeId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      isActive: true,
    })
    .returning();

  return NextResponse.json({ announcement: row }, { status: 201 });
}
