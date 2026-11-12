import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  candidates,
  candidateNotes,
  jobOpenings,
  employees,
  offerLetters,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star,
  Mail,
  Phone,
  Globe,
  FileText,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { CandidateStageSelector } from "@/components/candidate-stage-selector";
import { CandidateRating } from "@/components/candidate-rating";
import { CandidateNoteForm } from "@/components/candidate-note-form";
import { hiringAccessForCandidate } from "@/lib/hiring-access";
import { clampCandidateRating } from "@/lib/authz";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const { id } = await params;
  const candidateId = parseInt(id, 10);
  if (!Number.isFinite(candidateId)) {
    notFound();
  }

  const hiringAccess = await hiringAccessForCandidate(
    session.user.email,
    candidateId
  );
  if (hiringAccess.notFound) {
    notFound();
  }
  if (!hiringAccess.allowed) {
    redirect("/hiring");
  }

  const [candidate] = await db
    .select({
      id: candidates.id,
      jobOpeningId: candidates.jobOpeningId,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
      resumeUrl: candidates.resumeUrl,
      linkedinUrl: candidates.linkedinUrl,
      source: candidates.source,
      stage: candidates.stage,
      rating: candidates.rating,
      employeeId: candidates.employeeId,
      appliedAt: candidates.appliedAt,
      jobTitle: jobOpenings.title,
      jobDepartment: jobOpenings.departmentId,
    })
    .from(candidates)
    .leftJoin(jobOpenings, eq(candidates.jobOpeningId, jobOpenings.id))
    .where(eq(candidates.id, candidateId));

  if (!candidate) {
    notFound();
  }

  const notes = await db
    .select({
      id: candidateNotes.id,
      content: candidateNotes.content,
      createdAt: candidateNotes.createdAt,
      authorFirstName: employees.firstName,
      authorLastName: employees.lastName,
    })
    .from(candidateNotes)
    .leftJoin(employees, eq(candidateNotes.authorId, employees.id))
    .where(eq(candidateNotes.candidateId, candidateId))
    .orderBy(desc(candidateNotes.createdAt));

  const offerPublicFields = {
    id: offerLetters.id,
    candidateId: offerLetters.candidateId,
    jobTitle: offerLetters.jobTitle,
    startDate: offerLetters.startDate,
    signedAt: offerLetters.signedAt,
    documentUrl: offerLetters.documentUrl,
  };
  const [offer] = hiringAccess.canViewSalary
    ? await db
        .select({ ...offerPublicFields, salary: offerLetters.salary })
        .from(offerLetters)
        .where(eq(offerLetters.candidateId, candidateId))
    : (
        await db
          .select(offerPublicFields)
          .from(offerLetters)
          .where(eq(offerLetters.candidateId, candidateId))
      ).map((row) => ({ ...row, salary: null as string | null }));

  const stageLabels = {
    new: "New",
    phone_screen: "Phone Screen",
    interview: "Interview",
    offer: "Offer",
    hired: "Hired",
    rejected: "Rejected",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {candidate.firstName} {candidate.lastName}
          </h1>
          <p className="text-muted-foreground">
            Applied for{" "}
            <Link
              href={`/hiring/openings/${candidate.jobOpeningId}`}
              className="text-primary hover:underline"
            >
              {candidate.jobTitle}
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          {hiringAccess.allowed && candidate.stage === "hired" && !candidate.employeeId && (
            <Button asChild>
              <Link href={`/people/new?candidateId=${candidate.id}`}>
                Create employee
              </Link>
            </Button>
          )}
          {hiringAccess.allowed && (
            <Button asChild>
              <Link href={`/hiring/candidates/${candidate.id}/offer`}>
                {offer ? "Edit Offer" : "Create Offer"}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/hiring/openings/${candidate.jobOpeningId}/candidates`}>
              Back to Candidates
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Candidate Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${candidate.email}`}
                className="text-primary hover:underline"
              >
                {candidate.email}
              </a>
            </div>
            {candidate.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`tel:${candidate.phone}`}
                  className="text-primary hover:underline"
                >
                  {candidate.phone}
                </a>
              </div>
            )}
            {candidate.linkedinUrl && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <a
                  href={candidate.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  LinkedIn Profile
                </a>
              </div>
            )}
            {candidate.resumeUrl && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <a
                  href={candidate.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View Resume
                </a>
              </div>
            )}
            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="capitalize">
                  {candidate.source?.replace("_", " ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Applied</span>
                <span>{new Date(candidate.appliedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Stage</CardTitle>
            </CardHeader>
            <CardContent>
              {hiringAccess.allowed ? (
                <CandidateStageSelector
                  candidateId={candidate.id}
                  currentStage={candidate.stage}
                />
              ) : (
                <p className="capitalize">{candidate.stage?.replace("_", " ")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rating</CardTitle>
            </CardHeader>
            <CardContent>
              {hiringAccess.allowed ? (
                <CandidateRating
                  candidateId={candidate.id}
                  currentRating={clampCandidateRating(candidate.rating)}
                />
              ) : (
                <p>{clampCandidateRating(candidate.rating) ?? "Unrated"}</p>
              )}
            </CardContent>
          </Card>

          {offer && (
            <Card>
              <CardHeader>
                <CardTitle>Offer Letter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <strong>Position:</strong> {offer.jobTitle}
                </p>
                {offer.salary && (
                  <p className="text-sm">
                    <strong>Salary:</strong> ${offer.salary}
                  </p>
                )}
                {offer.startDate && (
                  <p className="text-sm">
                    <strong>Start Date:</strong> {offer.startDate}
                  </p>
                )}
                {offer.signedAt ? (
                  <Badge>Signed</Badge>
                ) : (
                  <Badge variant="outline">Pending</Badge>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Notes
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {hiringAccess.allowed && <CandidateNoteForm candidateId={candidate.id} />}

          <div className="space-y-4">
            {notes.length > 0 ? (
              notes.map((note) => (
                <div key={note.id} className="border-l-2 border-muted pl-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {note.authorFirstName} {note.authorLastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No notes yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
