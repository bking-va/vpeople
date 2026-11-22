import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobOpenings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assertCanMatchJob } from "@/lib/matching/access";
import { parseMatchFilters } from "@/lib/matching/filters";
import { presentableMatch, runCandidateMatch } from "@/lib/matching/search";
import { MATCHING_ADVISORY } from "@/lib/matching/types";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobOpeningIdRaw = body.jobOpeningId;
  const jobOpeningId =
    jobOpeningIdRaw == null || jobOpeningIdRaw === ""
      ? null
      : Number(jobOpeningIdRaw);
  if (jobOpeningId != null && !Number.isInteger(jobOpeningId)) {
    return NextResponse.json({ error: "Invalid jobOpeningId" }, { status: 400 });
  }

  const gate = await assertCanMatchJob(session.user.email, jobOpeningId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let roleQuery = typeof body.roleQuery === "string" ? body.roleQuery : "";
  let jobTitle: string | null = typeof body.jobTitle === "string" ? body.jobTitle : null;
  const defaults = parseMatchFilters(null);
  if (jobOpeningId) {
    const [opening] = await db
      .select({
        title: jobOpenings.title,
        description: jobOpenings.description,
        requirements: jobOpenings.requirements,
        locationRequirement: jobOpenings.locationRequirement,
        locationMaxDistanceKm: jobOpenings.locationMaxDistanceKm,
        locationWeight: jobOpenings.locationWeight,
      })
      .from(jobOpenings)
      .where(eq(jobOpenings.id, jobOpeningId))
      .limit(1);
    if (!opening) {
      return NextResponse.json({ error: "Job opening not found" }, { status: 404 });
    }
    jobTitle = jobTitle || opening.title;
    if (!roleQuery.trim()) {
      roleQuery = [opening.title, opening.description, opening.requirements]
        .filter(Boolean)
        .join("\n\n");
    }
    defaults.locationRequirement = opening.locationRequirement;
    defaults.maxDistanceKm = opening.locationMaxDistanceKm;
    defaults.locationWeight = opening.locationWeight;
  }

  const filters = parseMatchFilters(body, defaults);
  const result = await runCandidateMatch({
    actor: gate.actor,
    roleQuery,
    jobOpeningId,
    jobTitle,
    filters,
    saveFiltersToJob: body.saveFiltersToJob === true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    advisory: MATCHING_ADVISORY,
    model: result.result.model,
    usage: result.result.usage,
    truncated: result.result.truncated,
    results: result.result.results.map(presentableMatch),
  });
}
