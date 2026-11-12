import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, holidays } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserPermissions } from "@/lib/permissions";
import { canManageTimeOffOperations } from "@/lib/authz";

async function requireHolidayAdmin() {
  const session = await auth();
  if (!session?.user?.email || !session.user.employeeId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const [actor] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!actor) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const permissions = await getUserPermissions(session.user.email);
  if (
    !canManageTimeOffOperations({
      accessLevel: actor.accessLevel,
      canManageUsers: permissions.canManageUsers,
    })
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { actor };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireHolidayAdmin();
  if ("error" in gate) return gate.error;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  }

  const data = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof data.name === "string" && data.name.trim()) updates.name = data.name.trim();
  if (typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date.slice(0, 10))) {
    updates.date = data.date.slice(0, 10);
  }
  if (typeof data.country === "string" && data.country.trim()) {
    updates.country = data.country.trim();
  }
  if (data.isRecurring !== undefined) updates.isRecurring = Boolean(data.isRecurring);
  if (data.locationId !== undefined) {
    updates.locationId =
      data.locationId === null || data.locationId === ""
        ? null
        : parseInt(String(data.locationId), 10);
  }

  const [holiday] = await db
    .update(holidays)
    .set(updates)
    .where(eq(holidays.id, id))
    .returning();
  if (!holiday) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  }
  return NextResponse.json({ holiday });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireHolidayAdmin();
  if ("error" in gate) return gate.error;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  }

  const [deleted] = await db.delete(holidays).where(eq(holidays.id, id)).returning();
  if (!deleted) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
