import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { jobOpenings, candidates, candidateNotes, employees } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Mail, Phone, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { clampCandidateRating } from "@/lib/authz";

export default async function CandidatesListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { id } = await params;
  const openingId = parseInt(id);

  const [opening] = await db
    .select()
    .from(jobOpenings)
    .where(eq(jobOpenings.id, openingId));

  if (!opening) {
    notFound();
  }

  const candidatesList = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
      source: candidates.source,
      stage: candidates.stage,
      rating: candidates.rating,
      appliedAt: candidates.appliedAt,
      resumeUrl: candidates.resumeUrl,
      linkedinUrl: candidates.linkedinUrl,
    })
    .from(candidates)
    .where(eq(candidates.jobOpeningId, openingId))
    .orderBy(desc(candidates.appliedAt));

  const stageLabels = {
    new: "New",
    phone_screen: "Phone Screen",
    interview: "Interview",
    offer: "Offer",
    hired: "Hired",
    rejected: "Rejected",
  };

  const stageBadgeVariant = (stage: string) => {
    switch (stage) {
      case "hired":
        return "default";
      case "offer":
        return "secondary";
      case "rejected":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">
            {opening.title} - {candidatesList.length} applicants
          </p>
        </div>
        <Button asChild>
          <Link href={`/hiring/openings/${openingId}`}>Back to Opening</Link>
        </Button>
      </div>

      <div className="space-y-4">
        {candidatesList.map((candidate) => {
          const stars = clampCandidateRating(candidate.rating);
          return (
          <Link key={candidate.id} href={`/hiring/candidates/${candidate.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">
                        {candidate.firstName} {candidate.lastName}
                      </h3>
                      <Badge variant={stageBadgeVariant(candidate.stage)}>
                        {stageLabels[candidate.stage as keyof typeof stageLabels]}
                      </Badge>
                      {stars ? (
                          <div className="flex items-center gap-1">
                            {Array.from({ length: stars }).map((_, i) => (
                              <Star
                                key={i}
                                className="h-4 w-4 fill-yellow-400 text-yellow-400"
                              />
                            ))}
                          </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{candidate.email}</span>
                      </div>
                      {candidate.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <span>{candidate.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span className="capitalize">
                          {candidate.source?.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Applied {new Date(candidate.appliedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          );
        })}

        {candidatesList.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Candidates Yet</h3>
                <p className="text-muted-foreground">
                  Candidates will appear here once they apply
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
