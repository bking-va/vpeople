import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, employeeAccessScopes, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserPermissions } from "@/lib/permissions";
import { canManageAccessScopes } from "@/lib/access-scopes";
import { isFullAdmin } from "@/lib/authz";

async function requireScopeAdmin() {
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
    !canManageAccessScopes({
      employeeId: actor.id,
      accessLevel: actor.accessLevel,
      canManageUsers: permissions.canManageUsers,
    })
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { actor };
}

export async function GET(request: NextRequest) {
  const gate = await requireScopeAdmin();
  if ("error" in gate) return gate.error;

  const employeeId = parseInt(new URL(request.url).searchParams.get("employeeId") || "", 10);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  }

  const scopes = await db
    .select({
      id: employeeAccessScopes.id,
      employeeId: employeeAccessScopes.employeeId,
      locationId: employeeAccessScopes.locationId,
      country: employeeAccessScopes.country,
    })
    .from(employeeAccessScopes)
    .where(eq(employeeAccessScopes.employeeId, employeeId));

  return NextResponse.json({ scopes });
}

export async function PUT(request: NextRequest) {
  const gate = await requireScopeAdmin();
  if ("error" in gate) return gate.error;

  const data = await request.json();
  const employeeId = parseInt(String(data.employeeId), 10);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  }

  const [target] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (isFullAdmin(target.accessLevel)) {
    return NextResponse.json(
      { error: "full_admin cannot be region-scoped" },
      { status: 400 }
    );
  }

  const locationIds: number[] = [];
  if (Array.isArray(data.locationIds)) {
    const seen = new Set<number>();
    for (const item of data.locationIds) {
      const id = parseInt(String(item), 10);
      if (Number.isFinite(id) && !seen.has(id)) {
        seen.add(id);
        locationIds.push(id);
      }
    }
  }
  const countries: string[] = [];
  if (Array.isArray(data.countries)) {
    const seen = new Map<string, string>();
    for (const item of data.countries) {
      const country = String(item).trim();
      if (!country) continue;
      const key = country.toLowerCase();
      if (!seen.has(key)) seen.set(key, country);
    }
    countries.push(...seen.values());
  }

  if (locationIds.length) {
    const known = await db.select({ id: locations.id }).from(locations);
    const knownIds = new Set(known.map((row) => row.id));
    if (locationIds.some((id) => !knownIds.has(id))) {
      return NextResponse.json({ error: "Unknown location" }, { status: 400 });
    }
  }

  const rows = [
    ...locationIds.map((locationId) => ({
      employeeId,
      locationId,
      country: null as string | null,
    })),
    ...countries.map((country) => ({
      employeeId,
      locationId: null as number | null,
      country,
    })),
  ];

  await db.transaction(async (tx) => {
    await tx.delete(employeeAccessScopes).where(eq(employeeAccessScopes.employeeId, employeeId));
    if (rows.length) {
      await tx.insert(employeeAccessScopes).values(rows);
    }
  });

  const scopes = await db
    .select()
    .from(employeeAccessScopes)
    .where(eq(employeeAccessScopes.employeeId, employeeId));
  return NextResponse.json({ scopes });
}
