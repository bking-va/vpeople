import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { jobOpenings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assertCanMatchJob } from "@/lib/matching/access";
import { CandidateMatchPanel } from "@/components/candidate-match-panel";
import type { LocationRequirement } from "@/lib/matching/types";

export default async function JobCandidateMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/auth/signin");
  const { id } = await params;
  const openingId = parseInt(id, 10);
  if (!Number.isInteger(openingId)) notFound();

  const gate = await assertCanMatchJob(session.user.email, openingId);
  if (!gate.ok) redirect(`/hiring/openings/${openingId}`);

  const [opening] = await db
    .select({
      id: jobOpenings.id,
      title: jobOpenings.title,
      description: jobOpenings.description,
      requirements: jobOpenings.requirements,
      locationRequirement: jobOpenings.locationRequirement,
      locationMaxDistanceKm: jobOpenings.locationMaxDistanceKm,
      locationWeight: jobOpenings.locationWeight,
    })
    .from(jobOpenings)
    .where(eq(jobOpenings.id, openingId))
    .limit(1);
  if (!opening) notFound();

  const defaultRoleQuery = [opening.title, opening.description, opening.requirements]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Find candidates</h1>
        <p className="text-muted-foreground">{opening.title}</p>
      </div>
      <CandidateMatchPanel
        mode="job"
        jobOpeningId={opening.id}
        defaultRoleQuery={defaultRoleQuery}
        defaultRequirement={opening.locationRequirement as LocationRequirement}
        defaultMaxDistanceKm={opening.locationMaxDistanceKm}
        defaultWeight={opening.locationWeight}
        canSaveJobSettings={gate.actor.canManageAllHiring}
      />
    </div>
  );
}
