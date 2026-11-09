import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, terminationReasons } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { canWriteSettings } from "@/lib/authz";
import { isCanadianRoeCode } from "@/lib/roe";

export async function GET() {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reasons = await db
    .select()
    .from(terminationReasons)
    .orderBy(terminationReasons.name);
  return NextResponse.json({ terminationReasons: reasons });
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
  if (!canWriteSettings(actor?.accessLevel)) {
    return NextResponse.json({ error: "Only full admins can create termination reasons" }, { status: 403 });
  }

  const body = await request.json();
  if (!body.code || !body.name || !body.roeCode) {
    return NextResponse.json({ error: "code, name, and roeCode are required" }, { status: 400 });
  }
  if (!isCanadianRoeCode(body.roeCode)) {
    return NextResponse.json({ error: "Invalid Canadian ROE code" }, { status: 400 });
  }

  const [reason] = await db
    .insert(terminationReasons)
    .values({
      code: body.code,
      name: body.name,
      category: body.category || "other",
      roeCode: body.roeCode,
      description: body.description || null,
      isActive: body.isActive !== false,
    })
    .returning();

  return NextResponse.json({ terminationReason: reason }, { status: 201 });
}
