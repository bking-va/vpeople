import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customerLocations } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { canEditCustomerLocations } from "@/lib/matching/access";
import { parseCustomerLocationCsv } from "@/lib/matching/csv-import";
import { geocodeLocation } from "@/lib/matching/geocode";
import { coarseLocation } from "@/lib/matching/privacy";
import { createAuditLog } from "@/lib/audit";

async function requireEditor() {
  const session = await auth();
  if (!session?.user?.email || !session.user.employeeId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const allowed = await canEditCustomerLocations(session.user.email);
  if (!allowed) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const gate = await requireEditor();
  if ("error" in gate) return gate.error;
  const rows = await db
    .select()
    .from(customerLocations)
    .orderBy(desc(customerLocations.updatedAt));
  return NextResponse.json({ locations: rows });
}

export async function POST(request: NextRequest) {
  const gate = await requireEditor();
  if ("error" in gate) return gate.error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.csv === "string") {
    try {
      const parsed = parseCustomerLocationCsv(body.csv);
      if (parsed.length === 0) {
        return NextResponse.json({ error: "No customer location rows in CSV" }, { status: 400 });
      }
      if (parsed.length > 2000) {
        return NextResponse.json({ error: "CSV import is limited to 2000 rows" }, { status: 400 });
      }
      const inserted = await db.transaction(async (tx) => {
        const rows = [];
        for (const row of parsed) {
          const loc = coarseLocation(row);
          const coords = geocodeLocation(loc);
          const [saved] = await tx
            .insert(customerLocations)
            .values({
              label: row.label,
              city: loc.city ?? undefined,
              province: loc.province ?? undefined,
              country: row.country,
              postalCode: loc.postalCode ?? undefined,
              latitude: coords ? String(coords.lat) : undefined,
              longitude: coords ? String(coords.lng) : undefined,
              source: "csv",
              externalId: row.externalId ?? undefined,
              updatedAt: new Date(),
            })
            .returning();
          rows.push(saved);
        }
        return rows;
      });
      await createAuditLog({
        employeeId: gate.session.user.employeeId!,
        action: "customer_locations_imported",
        entityType: "customer_location",
        entityId: "csv",
        changes: { count: inserted.length },
      });
      return NextResponse.json({ locations: inserted, imported: inserted.length });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "CSV import failed" },
        { status: 400 }
      );
    }
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const country = typeof body.country === "string" ? body.country.trim() : "";
  if (!label || !country) {
    return NextResponse.json({ error: "label and country are required" }, { status: 400 });
  }
  const loc = coarseLocation({
    city: typeof body.city === "string" ? body.city : null,
    province: typeof body.province === "string" ? body.province : null,
    country,
    postalCode: typeof body.postalCode === "string" ? body.postalCode : null,
  });
  const coords = geocodeLocation(loc);
  const [saved] = await db
    .insert(customerLocations)
    .values({
      label,
      city: loc.city ?? undefined,
      province: loc.province ?? undefined,
      country,
      postalCode: loc.postalCode ?? undefined,
      latitude: coords ? String(coords.lat) : undefined,
      longitude: coords ? String(coords.lng) : undefined,
      source: "manual",
      externalId:
        typeof body.externalId === "string" && body.externalId.trim()
          ? body.externalId.trim()
          : undefined,
      updatedAt: new Date(),
    })
    .returning();
  await createAuditLog({
    employeeId: gate.session.user.employeeId!,
    action: "customer_location_created",
    entityType: "customer_location",
    entityId: String(saved.id),
    changes: { label, city: loc.city, country },
  });
  return NextResponse.json(saved);
}

export async function DELETE(request: NextRequest) {
  const gate = await requireEditor();
  if ("error" in gate) return gate.error;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await db.delete(customerLocations).where(eq(customerLocations.id, id));
  await createAuditLog({
    employeeId: gate.session.user.employeeId!,
    action: "customer_location_deleted",
    entityType: "customer_location",
    entityId: String(id),
    changes: { id },
  });
  return NextResponse.json({ success: true });
}
