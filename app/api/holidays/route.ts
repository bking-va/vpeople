import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, holidays } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserPermissions } from "@/lib/permissions";
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
  const permissions = await getSessionUserPermissions(session);
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

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.select().from(holidays).orderBy(holidays.date);
  return NextResponse.json({ holidays: rows });
}

export async function POST(request: NextRequest) {
  const gate = await requireHolidayAdmin();
  if ("error" in gate) return gate.error;

  const data = await request.json();
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const date = typeof data.date === "string" ? data.date.slice(0, 10) : "";
  const country = typeof data.country === "string" ? data.country.trim() : "";
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !country) {
    return NextResponse.json(
      { error: "name, date (YYYY-MM-DD), and country are required" },
      { status: 400 }
    );
  }

  const locationId =
    data.locationId === undefined || data.locationId === null || data.locationId === ""
      ? null
      : parseInt(String(data.locationId), 10);
  if (locationId != null && !Number.isFinite(locationId)) {
    return NextResponse.json({ error: "Invalid locationId" }, { status: 400 });
  }

  const [holiday] = await db
    .insert(holidays)
    .values({
      name,
      date,
      country,
      locationId,
      isRecurring: data.isRecurring !== false,
    })
    .returning();

  return NextResponse.json({ holiday }, { status: 201 });
}
