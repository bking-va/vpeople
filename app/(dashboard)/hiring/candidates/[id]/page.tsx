import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  candidates,
  candidateNotes,
  candidateApplicationAnswers,
  candidateApplicationComments,
  candidateStatusHistory,
  jobOpenings,
  employees,
  offerLetters,
} from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
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
      hasResumeBlob: sql<boolean>`${candidates.resumeBlobUrl} like 'https://%'`,
      coverLetter: candidates.coverLetter,
      linkedinUrl: candidates.linkedinUrl,
      source: candidates.source,
      sourceDetail: candidates.sourceDetail,
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

  const answers = await db
    .select({
      id: candidateApplicationAnswers.id,
      question: candidateApplicationAnswers.question,
      answer: candidateApplicationAnswers.answer,
    })
    .from(candidateApplicationAnswers)
    .where(eq(candidateApplicationAnswers.candidateId, candidateId))
    .orderBy(candidateApplicationAnswers.id);

  const importedComments = await db
    .select({
      id: candidateApplicationComments.id,
      authorName: candidateApplicationComments.authorName,
      content: candidateApplicationComments.content,
      commentedAt: candidateApplicationComments.commentedAt,
    })
    .from(candidateApplicationComments)
    .where(eq(candidateApplicationComments.candidateId, candidateId))
    .orderBy(desc(candidateApplicationComments.commentedAt));

  const statusHistory = await db
    .select({
      id: candidateStatusHistory.id,
      statusLabel: candidateStatusHistory.statusLabel,
      changedAt: candidateStatusHistory.changedAt,
      changedByName: candidateStatusHistory.changedByName,
    })
    .from(candidateStatusHistory)
    .where(eq(candidateStatusHistory.candidateId, candidateId))
    .orderBy(desc(candidateStatusHistory.changedAt));

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
            {(candidate.hasResumeBlob || candidate.resumeUrl) && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <a
                  href={
                    candidate.hasResumeBlob
                      ? `/api/hiring/candidates/${candidate.id}/resume`
                      : candidate.resumeUrl!
                  }
                  className="text-primary hover:underline"
                >
                  View Resume
                </a>
              </div>
            )}
            {candidate.sourceDetail && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source detail</span>
                <span>{candidate.sourceDetail}</span>
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

      {candidate.coverLetter && (
        <Card>
          <CardHeader>
            <CardTitle>Cover letter</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{candidate.coverLetter}</p>
          </CardContent>
        </Card>
      )}

      {answers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Application questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {answers.map((row) => (
              <div key={row.id}>
                <p className="text-sm font-medium">{row.question}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {row.answer || "—"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {statusHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Status history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statusHistory.map((row) => (
              <div key={row.id} className="flex justify-between text-sm">
                <span>{row.statusLabel}</span>
                <span className="text-muted-foreground">
                  {row.changedByName ? `${row.changedByName} · ` : ""}
                  {row.changedAt ? new Date(row.changedAt).toLocaleDateString() : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {importedComments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Imported comments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {importedComments.map((row) => (
              <div key={row.id} className="border-l-2 border-muted pl-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{row.authorName || "BambooHR"}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.commentedAt ? new Date(row.commentedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{row.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
