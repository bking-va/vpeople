import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, terminationReasons } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { canWriteSettings } from "@/lib/authz";
import { isCanadianRoeCode } from "@/lib/roe";

async function requireAdmin(employeeId: number) {
  const [actor] = await db
    .select({ accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return canWriteSettings(actor?.accessLevel);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await requireAdmin(session.user.employeeId))) {
    return NextResponse.json({ error: "Only full admins can update termination reasons" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  if (body.roeCode && !isCanadianRoeCode(body.roeCode)) {
    return NextResponse.json({ error: "Invalid Canadian ROE code" }, { status: 400 });
  }

  const [reason] = await db
    .update(terminationReasons)
    .set({
      name: body.name,
      category: body.category,
      roeCode: body.roeCode,
      description: body.description ?? null,
      isActive: body.isActive,
      updatedAt: new Date(),
    })
    .where(eq(terminationReasons.id, parseInt(id, 10)))
    .returning();

  if (!reason) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ terminationReason: reason });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await requireAdmin(session.user.employeeId))) {
    return NextResponse.json({ error: "Only full admins can delete termination reasons" }, { status: 403 });
  }

  const { id } = await params;
  await db.delete(terminationReasons).where(eq(terminationReasons.id, parseInt(id, 10)));
  return NextResponse.json({ success: true });
}
