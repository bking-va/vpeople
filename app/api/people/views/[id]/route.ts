import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { peopleViews, employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const { id } = await params;
  const viewId = parseInt(id);
  const data = await request.json();

  // Verify ownership
  const [existingView] = await db
    .select()
    .from(peopleViews)
    .where(and(eq(peopleViews.id, viewId), eq(peopleViews.userId, employee.id)))
    .limit(1);

  if (!existingView) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  const [updatedView] = await db
    .update(peopleViews)
    .set({
      name: data.name ?? existingView.name,
      columns: data.columns ? JSON.stringify(data.columns) : existingView.columns,
      filters: data.filters ? JSON.stringify(data.filters) : existingView.filters,
      sortBy: data.sortBy !== undefined ? data.sortBy : existingView.sortBy,
      sortOrder: data.sortOrder ?? existingView.sortOrder,
      isDefault: data.isDefault !== undefined ? data.isDefault : existingView.isDefault,
      updatedAt: new Date(),
    })
    .where(eq(peopleViews.id, viewId))
    .returning();

  return NextResponse.json({ view: updatedView });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const { id } = await params;
  const viewId = parseInt(id);

  // Verify ownership
  const [existingView] = await db
    .select()
    .from(peopleViews)
    .where(and(eq(peopleViews.id, viewId), eq(peopleViews.userId, employee.id)))
    .limit(1);

  if (!existingView) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  await db.delete(peopleViews).where(eq(peopleViews.id, viewId));

  return NextResponse.json({ success: true });
}
