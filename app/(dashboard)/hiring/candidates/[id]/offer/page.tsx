import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { candidates, jobOpenings, offerLetters } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { OfferLetterForm } from "@/components/offer-letter-form";

export default async function CreateOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/hiring");
  }

  const { id } = await params;
  const candidateId = parseInt(id);

  const [candidate] = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      jobOpeningId: candidates.jobOpeningId,
      jobTitle: jobOpenings.title,
    })
    .from(candidates)
    .leftJoin(jobOpenings, eq(candidates.jobOpeningId, jobOpenings.id))
    .where(eq(candidates.id, candidateId));

  if (!candidate) {
    notFound();
  }

  const [existingOffer] = await db
    .select()
    .from(offerLetters)
    .where(eq(offerLetters.candidateId, candidateId));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {existingOffer ? "Edit" : "Create"} Offer Letter
        </h1>
        <p className="text-muted-foreground">
          For {candidate.firstName} {candidate.lastName} - {candidate.jobTitle}
        </p>
      </div>

      <OfferLetterForm
        candidateId={candidate.id}
        candidateName={`${candidate.firstName} ${candidate.lastName}`}
        defaultJobTitle={candidate.jobTitle || ""}
        existingOffer={existingOffer || undefined}
      />
    </div>
  );
}
