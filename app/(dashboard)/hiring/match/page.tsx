import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { assertCanMatchJob } from "@/lib/matching/access";
import { CandidateMatchPanel } from "@/components/candidate-match-panel";

export default async function AdHocCandidateMatchPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/auth/signin");
  const gate = await assertCanMatchJob(session.user.email);
  if (!gate.ok) redirect("/hiring");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Find candidates</h1>
        <p className="text-muted-foreground">
          Search current and former employees plus ATS applicants from a free-text role. Rankings are
          advisory and stay on this internal hiring surface.
        </p>
      </div>
      <CandidateMatchPanel mode="ad-hoc" />
    </div>
  );
}
