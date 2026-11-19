/**
 * Real Postgres coverage for PR B batched ATS writes: candidates, Q&A,
 * comments, and status history use VALUES + explicit CASTs.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  candidateApplicationAnswers,
  candidateApplicationComments,
  candidateStatusHistory,
  candidates,
  jobOpenings,
} from "@/lib/db/schema";
import { createBambooSyncStore } from "@/lib/bamboo-sync/store";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for integration tests"
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {
  schema: {
    jobOpenings,
    candidates,
    candidateApplicationAnswers,
    candidateApplicationComments,
    candidateStatusHistory,
  },
});

describe("BambooHR ATS batched writes (Real Postgres)", () => {
  const runId = Date.now();
  const jobBambooId = `ATSJOB_${runId}`;
  const appBambooId = `ATSAPP_${runId}`;
  let openingId: number | null = null;
  let candidateId: number | null = null;

  afterAll(async () => {
    try {
      if (candidateId) {
        await db
          .delete(candidateApplicationAnswers)
          .where(eq(candidateApplicationAnswers.candidateId, candidateId));
        await db
          .delete(candidateApplicationComments)
          .where(eq(candidateApplicationComments.candidateId, candidateId));
        await db
          .delete(candidateStatusHistory)
          .where(eq(candidateStatusHistory.candidateId, candidateId));
        await db.delete(candidates).where(eq(candidates.id, candidateId));
      }
      if (openingId) {
        await db.delete(jobOpenings).where(eq(jobOpenings.id, openingId));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("upserts applications and child rows via CASTed VALUES", async () => {
    const store = createBambooSyncStore(db);
    await store.upsertJobOpeningsBatch(
      [
        {
          bambooId: jobBambooId,
          title: "ATS Import Role",
          departmentId: null,
          locationId: null,
          hiringLeadId: null,
          status: "open",
          bambooStatusId: "4",
          bambooStatusLabel: "Open",
          employmentType: "full_time",
          description: null,
          requirements: null,
          openDate: "2024-01-01",
          closeDate: null,
        },
      ],
      { chunkSize: 50 }
    );
    const jobs = await store.listJobOpeningIdsByBambooId();
    openingId = jobs.get(jobBambooId) ?? null;
    expect(openingId).not.toBeNull();

    const ids = await store.upsertCandidatesBatch(
      [
        {
          bambooId: appBambooId,
          jobOpeningId: openingId!,
          firstName: "Ada",
          lastName: "Lovelace",
          email: `ada.${runId}@invalid.local`,
          phone: "555-0100",
          linkedinUrl: null,
          source: "indeed",
          sourceDetail: "Indeed",
          stage: "interview",
          bambooStatusId: "3",
          bambooStatusLabel: "Interview",
          rating: 4,
          appliedAt: "2024-03-01T12:00:00Z",
          coverLetter: "Hello",
          resumeBambooFileId: "99",
          resumeBlobUrl: null,
          atsDetailImportedAt: "2024-03-02T00:00:00Z",
        },
      ],
      { chunkSize: 50 }
    );
    candidateId = ids.get(appBambooId) ?? null;
    expect(candidateId).not.toBeNull();

    await store.upsertCandidateAnswersBatch(
      [
        {
          candidateId: candidateId!,
          bambooQuestionId: `q-${runId}`,
          question: "Work authorization?",
          answer: "Yes",
        },
      ],
      { chunkSize: 50 }
    );
    await store.upsertCandidateCommentsBatch(
      [
        {
          candidateId: candidateId!,
          bambooId: `cmt-${runId}`,
          authorName: "Pat",
          authorBambooId: null,
          content: "Strong",
          commentedAt: "2024-03-03T00:00:00Z",
        },
      ],
      { chunkSize: 50 }
    );
    await store.upsertCandidateStatusHistoryBatch(
      [
        {
          candidateId: candidateId!,
          bambooEventId: `${appBambooId}:3:2024-03-01`,
          bambooStatusId: "3",
          statusLabel: "Interview",
          changedAt: "2024-03-01T12:00:00Z",
          changedByName: "System",
        },
      ],
      { chunkSize: 50 }
    );

    const [candidate] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.bambooId, appBambooId));
    expect(candidate.stage).toBe("interview");
    expect(candidate.source).toBe("indeed");
    expect(candidate.rating).toBe(4);
    expect(candidate.coverLetter).toBe("Hello");
    expect(candidate.resumeBlobUrl).toBeNull();

    await store.upsertCandidatesBatch(
      [
        {
          bambooId: appBambooId,
          jobOpeningId: openingId!,
          firstName: "Ada",
          lastName: "Lovelace",
          email: `ada.${runId}@invalid.local`,
          phone: "555-0100",
          linkedinUrl: null,
          source: "indeed",
          sourceDetail: "Indeed",
          stage: "offer",
          bambooStatusId: "5",
          bambooStatusLabel: "Offer",
          rating: 5,
          appliedAt: "2024-03-01T12:00:00Z",
          coverLetter: "Hello updated",
          resumeBambooFileId: "99",
          resumeBlobUrl: null,
          atsDetailImportedAt: "2024-03-04T00:00:00Z",
        },
      ],
      { chunkSize: 50 }
    );
    const [updated] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.bambooId, appBambooId));
    expect(updated.stage).toBe("offer");
    expect(updated.coverLetter).toBe("Hello updated");
    expect(updated.rating).toBe(5);

    const answers = await db
      .select()
      .from(candidateApplicationAnswers)
      .where(eq(candidateApplicationAnswers.candidateId, candidateId!));
    expect(answers).toHaveLength(1);
    expect(answers[0].question).toBe("Work authorization?");

    const comments = await db
      .select()
      .from(candidateApplicationComments)
      .where(eq(candidateApplicationComments.candidateId, candidateId!));
    expect(comments[0].content).toBe("Strong");
  });
});
