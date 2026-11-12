import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobOpenings, departments, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { toPublicCareerOpening } from "@/lib/careers-public";

export async function GET() {
  try {
    const openings = await db
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
      .where(eq(jobOpenings.status, "open"));

    return NextResponse.json({
      openings: openings.map(toPublicCareerOpening),
    });
  } catch (error) {
    console.error("Failed to list public careers:", error);
    return NextResponse.json({ error: "Failed to list openings" }, { status: 500 });
  }
}
