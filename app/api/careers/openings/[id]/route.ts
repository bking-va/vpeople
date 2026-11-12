import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobOpenings, departments, locations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { toPublicCareerOpening } from "@/lib/careers-public";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const openingId = parseInt(id, 10);
  if (!Number.isFinite(openingId)) {
    return NextResponse.json({ error: "Opening not available" }, { status: 404 });
  }

  try {
    const [opening] = await db
      .select({
        id: jobOpenings.id,
        title: jobOpenings.title,
        employmentType: jobOpenings.employmentType,
        description: jobOpenings.description,
        requirements: jobOpenings.requirements,
        openDate: jobOpenings.openDate,
        departmentName: departments.name,
        locationName: locations.name,
      })
      .from(jobOpenings)
      .leftJoin(departments, eq(jobOpenings.departmentId, departments.id))
      .leftJoin(locations, eq(jobOpenings.locationId, locations.id))
      .where(and(eq(jobOpenings.id, openingId), eq(jobOpenings.status, "open")))
      .limit(1);

    if (!opening) {
      return NextResponse.json({ error: "Opening not available" }, { status: 404 });
    }

    return NextResponse.json({ opening: toPublicCareerOpening(opening) });
  } catch (error) {
    console.error("Failed to load public career opening:", error);
    return NextResponse.json({ error: "Failed to load opening" }, { status: 500 });
  }
}
