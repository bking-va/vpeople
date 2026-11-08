import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { peopleViews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db.query.employees.findMany({
    where: (employees, { eq }) => eq(employees.email, session.user.email),
    limit: 1,
  });

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const views = await db
    .select()
    .from(peopleViews)
    .where(eq(peopleViews.userId, employee.id));

  return NextResponse.json({ views });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db.query.employees.findMany({
    where: (employees, { eq }) => eq(employees.email, session.user.email),
    limit: 1,
  });

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const data = await request.json();

  const [view] = await db
    .insert(peopleViews)
    .values({
      userId: employee.id,
      name: data.name,
      columns: JSON.stringify(data.columns),
      filters: data.filters ? JSON.stringify(data.filters) : null,
      sortBy: data.sortBy || null,
      sortOrder: data.sortOrder || "asc",
      isDefault: data.isDefault || false,
    })
    .returning();

  return NextResponse.json({ view });
}
