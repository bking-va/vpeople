import { BambooHrClient, BAMBOO_ATS_DETAIL_CONCURRENCY } from "@/lib/bamboo-sync/client";
import {
  formatBambooNewSince,
  mapApplicationStage,
  mapAtsAnswers,
  mapAtsApplication,
  mapAtsComments,
  mapAtsStatusHistory,
  mapCandidateSource,
} from "@/lib/bamboo-sync/map-ats";
import {
  formatAtsDetailsProgress,
  runAtsApplicationsSync,
} from "@/lib/bamboo-sync/ats-applications";
import { atsResumeBlobPath, BAMBOO_RESUME_UNAVAILABLE, isStoredResumeBlobUrl } from "@/lib/bamboo-sync/blob";
import { toPublicCareerOpening } from "@/lib/careers-public";
import type { BambooSyncStore } from "@/lib/bamboo-sync/sync";
import {
  compareBambooApplicationIds,
  isResumableAtsRun,
  laterBambooApplicationId,
} from "@/lib/bamboo-sync/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

class FakeAtsStore {
  jobOpenings: Array<Record<string, unknown>> = [
    { id: 10, bambooId: "22", title: "Engineer" },
  ];
  candidates: Array<Record<string, unknown>> = [];
  answers: Array<Record<string, unknown>> = [];
  comments: Array<Record<string, unknown>> = [];
  history: Array<Record<string, unknown>> = [];
  syncRuns: Array<Record<string, unknown>> = [];
  emailsSent = 0;
  webhookCalls = 0;
  nextId = 100;
  writes = 0;

  async listEmployees() {
    return [];
  }
  async replaceDemoEmployees() {
    return { removed: 0, brendanSnapshot: null };
  }
  async upsertOrgUnit() {
    return 1;
  }
  async upsertOrgUnits() {
    return new Map();
  }
  async upsertEmployee() {
    return { id: 1, created: true };
  }
  async upsertEmployeesBatch() {
    return { idByBambooId: new Map(), created: 0, updated: 0 };
  }
  async setManager() {}
  async setManagersBatch() {}
  async setUnresolvedSupervisor() {}
  async setUnresolvedSupervisorsBatch() {}
  async listUnresolvedSupervisors() {
    return [];
  }
  async markTerminated() {}
  async markTerminatedBatch() {}
  async replaceJobHistory() {}
  async replaceJobHistoryMany() {}
  async replaceEmploymentStatusHistory() {}
  async replaceEmploymentStatusHistoryMany() {}
  async replaceCompensationHistory() {}
  async replaceCompensationHistoryMany() {}
  async replaceEmergencyContacts() {}
  async replaceEmergencyContactsMany() {}
  async upsertTimeOffPolicy() {
    return 1;
  }
  async upsertTimeOffPoliciesBatch() {
    return new Map();
  }
  async upsertTimeOffBalance() {}
  async upsertTimeOffBalancesBatch() {}
  async upsertTimeOffRequestsBatch() {
    return 0;
  }
  async upsertEducationBatch() {
    return 0;
  }
  async upsertVisasBatch() {
    return 0;
  }
  async applyBrendanCarryOver() {
    return false;
  }
  async recordSyncRun(run: Record<string, unknown>) {
    this.syncRuns.push(run);
  }
  async lastSuccessfulIncrementalCursor() {
    return null;
  }
  async upsertJobOpeningsBatch(rows: Array<Record<string, unknown>>) {
    for (const row of rows) {
      const existing = this.jobOpenings.find((item) => item.bambooId === row.bambooId);
      if (existing) Object.assign(existing, row);
      else this.jobOpenings.push({ ...row, id: this.nextId++ });
    }
    return rows.length;
  }
  async pruneImportedRowsNotIn() {
    return 0;
  }
  async listJobOpeningIdsByBambooId() {
    return new Map(
      this.jobOpenings
        .filter((row) => row.bambooId)
        .map((row) => [String(row.bambooId), Number(row.id)])
    );
  }
  async upsertCandidatesBatch(rows: Array<Record<string, unknown>>) {
    const ids = new Map<string, number>();
    for (const row of rows) {
      this.writes += 1;
      const existing = this.candidates.find((item) => item.bambooId === row.bambooId);
      const next = { ...row };
      if (existing) {
        if (next.atsDetailImportedAt == null) {
          next.atsDetailImportedAt = existing.atsDetailImportedAt;
        }
        if (next.resumeBlobUrl == null) {
          next.resumeBlobUrl = existing.resumeBlobUrl;
        }
        Object.assign(existing, next);
      } else this.candidates.push({ ...next, id: this.nextId++ });
      const stored = this.candidates.find((item) => item.bambooId === row.bambooId)!;
      ids.set(String(row.bambooId), Number(stored.id));
    }
    return ids;
  }
  async upsertCandidateAnswersBatch(rows: Array<Record<string, unknown>>) {
    this.answers.push(...rows);
    return rows.length;
  }
  async upsertCandidateCommentsBatch(rows: Array<Record<string, unknown>>) {
    this.comments.push(...rows);
    return rows.length;
  }
  async upsertCandidateStatusHistoryBatch(rows: Array<Record<string, unknown>>) {
    this.history.push(...rows);
    return rows.length;
  }
  async listCandidatesNeedingDetail(limit: number, afterBambooId?: string | null) {
    return this.candidates
      .filter((row) => row.bambooId && !row.atsDetailImportedAt)
      .filter(
        (row) =>
          !afterBambooId ||
          compareBambooApplicationIds(String(row.bambooId), afterBambooId) > 0
      )
      .sort((a, b) =>
        compareBambooApplicationIds(String(a.bambooId), String(b.bambooId))
      )
      .slice(0, limit)
      .map((row) => ({ id: Number(row.id), bambooId: String(row.bambooId) }));
  }
  async listCandidatesForCommentsHistoryBackfill(
    limit: number,
    afterBambooId?: string | null
  ) {
    return this.candidates
      .filter((row) => row.bambooId && row.atsDetailImportedAt)
      .filter(
        (row) =>
          !afterBambooId ||
          compareBambooApplicationIds(String(row.bambooId), afterBambooId) > 0
      )
      .sort((a, b) =>
        compareBambooApplicationIds(String(a.bambooId), String(b.bambooId))
      )
      .slice(0, limit)
      .map((row) => ({ id: Number(row.id), bambooId: String(row.bambooId) }));
  }
  async listCandidatesNeedingResume(limit: number) {
    return this.candidates
      .filter((row) => row.bambooId && row.resumeBambooFileId && !row.resumeBlobUrl)
      .slice(0, limit)
      .map((row) => ({
        id: Number(row.id),
        bambooId: String(row.bambooId),
        resumeBambooFileId: String(row.resumeBambooFileId),
      }));
  }
  async setCandidateResumeBlob(bambooId: string, blobUrl: string) {
    const row = this.candidates.find((item) => item.bambooId === bambooId);
    if (row) row.resumeBlobUrl = blobUrl;
  }
  async requeueCandidateDetails() {
    let count = 0;
    for (const row of this.candidates) {
      if (row.bambooId && row.atsDetailImportedAt) {
        row.atsDetailImportedAt = null;
        count += 1;
      }
    }
    return count;
  }
  async markCandidateDetailImported(bambooIds: string[]) {
    for (const id of bambooIds) {
      const row = this.candidates.find((item) => item.bambooId === id);
      if (row) row.atsDetailImportedAt = new Date().toISOString();
    }
  }
  async startSyncRun(run: Record<string, unknown>) {
    const id = this.nextId++;
    this.syncRuns.push({ ...run, id });
    return id;
  }
  async updateSyncRun(id: number, run: Record<string, unknown>) {
    const existing = this.syncRuns.find((item) => item.id === id);
    if (existing) Object.assign(existing, run);
  }
  async lastIncompleteAtsCheckpoint() {
    const row = [...this.syncRuns]
      .reverse()
      .find((item) => isResumableAtsRun(item.status, item.checkpoint) && item.kind === "ats_applications");
    if (!row) return null;
    return {
      id: Number(row.id),
      checkpoint: (row.checkpoint as Record<string, unknown>) || null,
      latestChanged: (row.latestChanged as string) || null,
    };
  }
  async lastSuccessfulAtsCursor() {
    return null;
  }
}

function mockAtsFetch(): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes("/applicant_tracking/statuses")) {
      return jsonResponse({
        applicationStatuses: [
          { id: "1", name: "New", code: 1 },
          { id: "9", name: "Hired", code: 4 },
        ],
      });
    }
    if (url.includes("/applicant_tracking/applications?") && url.includes("page=1")) {
      return jsonResponse({
        applications: [
          {
            id: 40316,
            appliedDate: "2024-01-15 12:00:00",
            status: { id: 1, label: "New" },
            rating: 4,
            source: "Indeed",
            applicant: {
              firstName: "Ada",
              lastName: "Lovelace",
              email: "ada@example.com",
              phone: "555-0100",
            },
            job: { id: 22, title: "Engineer" },
          },
        ],
        paginationComplete: false,
      });
    }
    if (url.includes("/applicant_tracking/applications?") && url.includes("page=2")) {
      return jsonResponse({ applications: [], paginationComplete: true });
    }
    if (url.includes("/applicant_tracking/applications/40316")) {
      return jsonResponse({
        id: 40316,
        appliedDate: "2024-01-15 12:00:00",
        status: { id: 1, label: "New" },
        rating: 4,
        source: "Indeed",
        coverLetter: "I would like to apply",
        resumeFileId: 99,
        applicant: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
        },
        job: { id: 22, title: "Engineer" },
        questionsAndAnswers: [
          { id: "q1", question: "Work authorization?", answer: "Yes" },
        ],
        comments: [
          {
            id: "c1",
            comment: "Strong candidate",
            author: { name: "Pat" },
            created: "2024-01-16 00:00:00",
          },
        ],
        statusHistory: [
          {
            status: { id: "1", label: "New" },
            date: "2024-01-15 12:00:00",
            user: { name: "System" },
          },
        ],
      });
    }
    if (url.includes("/files/99")) {
      return new Response(Buffer.from("%PDF-fake"), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="ada.pdf"',
        },
      });
    }
    return jsonResponse({ error: url }, 404);
  };
}

describe("ATS application mapping", () => {
  test("maps list payload without triggering workflows or emails", () => {
    const mapped = mapAtsApplication({
      id: 7,
      status: { id: 9, label: "Hired" },
      source: "Employee Referral",
      rating: 5,
      applicant: { firstName: "Lin", lastName: "Mei", email: "lin@example.com" },
      job: { id: 3, title: "PM" },
    });
    expect(mapped?.stage).toBe("hired");
    expect(mapped?.source).toBe("referral");
    expect(mapped?.jobBambooId).toBe("3");
    expect(mapCandidateSource("LinkedIn")).toEqual({
      source: "linkedin",
      detail: "LinkedIn",
    });
    expect(mapApplicationStage({ label: "Phone Screen" })).toBe("phone_screen");
  });

  test("maps Q&A, comments, and status history and drops secret-looking keys", () => {
    const raw = {
      id: 7,
      ssn: "000-00-0000",
      questionsAndAnswers: [{ id: "1", question: "Why us?", answer: "Mission" }],
      comments: [{ id: "8", comment: "Move forward", author: "Sam", created: "2024-02-01" }],
      statusHistory: [
        { status: { id: "2", label: "Interview" }, date: "2024-02-02", user: "Alex" },
      ],
    };
    expect(mapAtsAnswers(raw, "7")).toEqual([
      { bambooQuestionId: "1", question: "Why us?", answer: "Mission" },
    ]);
    expect(mapAtsComments(raw, "7")[0]).toMatchObject({
      bambooId: "8",
      content: "Move forward",
    });
    expect(mapAtsStatusHistory(raw, "7")[0].bambooEventId).toContain("7:2:");
  });

  test("maps documented Bamboo GET application details (no comments[] or statusHistory[])", () => {
    const raw = {
      id: 92654,
      appliedDate: "2024-01-15T14:30:00Z",
      status: {
        id: 3,
        label: "Interview",
        dateChanged: "2024-01-18T09:15:00Z",
        changedByUser: { id: 12, firstName: "Pat", lastName: "Kim" },
      },
      commentCount: 3,
      emailCount: 1,
      eventCount: 2,
      movedTo: [],
      movedFrom: [],
      questionsAndAnswers: [
        {
          question: { id: 11, label: "Are you authorized to work in the country?" },
          answer: { id: 21, label: "Yes" },
        },
      ],
      applicant: { firstName: "Jordan", lastName: "Lee", email: "jordan.lee@example.com" },
      job: { id: 88, title: { id: 5, label: "Software Engineer" } },
    };
    expect(mapAtsAnswers(raw, "92654")).toEqual([
      {
        bambooQuestionId: "11",
        question: "Are you authorized to work in the country?",
        answer: "Yes",
      },
    ]);
    expect(mapAtsComments(raw, "92654")).toEqual([]);
    const history = mapAtsStatusHistory(raw, "92654");
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statusLabel: "Applied",
          changedAt: "2024-01-15T14:30:00Z",
        }),
        expect.objectContaining({
          bambooStatusId: "3",
          statusLabel: "Interview",
          changedAt: "2024-01-18T09:15:00Z",
          changedByName: "Pat Kim",
        }),
      ])
    );
    expect(history).toHaveLength(2);
  });

  test("formats Bamboo newSince without ISO T/Z", () => {
    expect(formatBambooNewSince(new Date("2024-01-01T13:00:00Z"))).toBe(
      "2024-01-01 13:00:00"
    );
  });

  test("resume blob paths are not guessable from Bamboo ids alone", () => {
    const a = atsResumeBlobPath("40316", "resume.pdf");
    const b = atsResumeBlobPath("40316", "resume.pdf");
    expect(a).toMatch(/^ats-resumes\/40316\//);
    expect(a).not.toBe(b);
  });
});

describe("runAtsApplicationsSync", () => {
  test("imports applications with Q&A and never sends email", async () => {
    const store = new FakeAtsStore();
    const blobs: string[] = [];
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockAtsFetch(),
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: {
        async putPrivate(input) {
          blobs.push(input.pathname);
          return { url: `https://blob.vercel-storage.com/${input.pathname}` };
        },
      },
      mode: "full",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(store.emailsSent).toBe(0);
    expect(store.webhookCalls).toBe(0);
    expect(store.candidates).toHaveLength(1);
    expect(store.candidates[0].coverLetter).toBe("I would like to apply");
    expect(store.answers).toHaveLength(1);
    expect(store.comments).toHaveLength(1);
    expect(store.history.some((row) => row.statusLabel === "New")).toBe(true);
    expect(store.history.length).toBeGreaterThanOrEqual(1);
    expect(store.candidates[0].resumeBlobUrl).toContain("blob.vercel-storage.com");
    expect(blobs[0]).toMatch(/^ats-resumes\/40316\//);
    expect(JSON.stringify(store.syncRuns)).not.toMatch(/ada@example.com/i);
  });

  test("checkpoints when the list page budget is exhausted", async () => {
    const store = new FakeAtsStore();
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockAtsFetch(),
    });
    const first = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      maxListPages: 1,
      log: () => undefined,
    });
    expect(first.status).toBe("checkpointed");
    expect(first.checkpoint.phase).toBe("list");
    const second = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      log: () => undefined,
    });
    expect(["success", "checkpointed"]).toContain(second.status);
    expect(store.candidates.length).toBeGreaterThan(0);
  });

  test("page budget is relative to the checkpointed list page", async () => {
    const store = new FakeAtsStore();
    store.syncRuns.push({
      id: 1,
      kind: "ats_applications",
      status: "checkpointed",
      checkpoint: {
        phase: "list",
        listPage: 21,
        lastListId: null,
        lastDetailId: null,
        lastResumeId: null,
        listed: 2000,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: false,
      },
    });
    const pages: number[] = [];
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/applicant_tracking/statuses")) {
          return jsonResponse({ applicationStatuses: [] });
        }
        const match = url.match(/page=(\d+)/);
        if (url.includes("/applicant_tracking/applications?") && match) {
          pages.push(Number(match[1]));
          return jsonResponse({
            applications: [
              {
                id: 30000 + Number(match[1]),
                applicant: {
                  firstName: "Pat",
                  lastName: "Page",
                  email: `unknown+app-${match[1]}@invalid.local`,
                },
                job: { id: 22, title: "Engineer" },
              },
            ],
            paginationComplete: false,
          });
        }
        return jsonResponse({}, 404);
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "incremental",
      importResumes: false,
      maxListPages: 20,
      log: () => undefined,
    });
    expect(result.status).toBe("checkpointed");
    expect(pages[0]).toBe(21);
    expect(pages).toHaveLength(20);
    expect(pages[pages.length - 1]).toBe(40);
  });

  test("marks a 404 resume unavailable so the resume phase cannot loop", async () => {
    const store = new FakeAtsStore();
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/files/99")) {
          return jsonResponse({ error: "missing" }, 404);
        }
        return mockAtsFetch()(input);
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: {
        async putPrivate() {
          throw new Error("should not upload a missing resume");
        },
      },
      mode: "full",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(store.candidates[0].resumeBlobUrl).toBe(BAMBOO_RESUME_UNAVAILABLE);
    expect(isStoredResumeBlobUrl(String(store.candidates[0].resumeBlobUrl))).toBe(
      false
    );
    const stillNeeded = await store.listCandidatesNeedingResume(10);
    expect(stillNeeded).toHaveLength(0);
  });

  test("resumes a failed ATS run that still has a checkpoint", async () => {
    const store = new FakeAtsStore();
    store.syncRuns.push({
      id: 7,
      kind: "ats_applications",
      status: "failed",
      checkpoint: {
        phase: "list",
        listPage: 1,
        lastListId: null,
        lastDetailId: null,
        lastResumeId: null,
        listed: 0,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: false,
      },
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockAtsFetch(),
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: {
        async putPrivate(input) {
          return { url: `https://blob.vercel-storage.com/${input.pathname}` };
        },
      },
      mode: "full",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(store.syncRuns[0].status).toBe("success");
    expect(store.candidates).toHaveLength(1);
  });

  test("full import skips already imported details unless requeueDetails is set", async () => {
    const store = new FakeAtsStore();
    store.candidates.push({
      id: 50,
      bambooId: "40316",
      jobOpeningId: 10,
      atsDetailImportedAt: "2024-01-01T00:00:00Z",
      resumeBambooFileId: "99",
      resumeBlobUrl: null,
    });
    let detailCalls = 0;
    const inner = mockAtsFetch();
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input, init) => {
        if (String(input).includes("/applicant_tracking/applications/40316")) {
          detailCalls += 1;
        }
        return inner(input, init);
      },
    });
    const skipped = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      onlyMissing: true,
      log: () => undefined,
    });
    expect(skipped.status).toBe("success");
    expect(detailCalls).toBe(0);
    expect(store.answers).toHaveLength(0);

    const refreshed = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      requeueDetails: true,
      log: () => undefined,
    });
    expect(refreshed.status).toBe("success");
    expect(detailCalls).toBeGreaterThan(0);
    expect(store.answers.length).toBeGreaterThan(0);
  });

  test("resume-from skips earlier application ids in the details phase", async () => {
    const store = new FakeAtsStore();
    store.candidates.push(
      {
        id: 1,
        bambooId: "100",
        jobOpeningId: 10,
        atsDetailImportedAt: null,
      },
      {
        id: 2,
        bambooId: "200",
        jobOpeningId: 10,
        atsDetailImportedAt: null,
      }
    );
    const requested: string[] = [];
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/applicant_tracking/statuses")) {
          return jsonResponse({ applicationStatuses: [] });
        }
        if (url.includes("/applicant_tracking/applications?")) {
          return jsonResponse({ applications: [], paginationComplete: true });
        }
        const match = url.match(/applications\/(\d+)$/);
        if (match) {
          requested.push(match[1]);
          return jsonResponse({
            id: Number(match[1]),
            job: { id: 22, title: "Engineer" },
            applicant: { firstName: "Pat", lastName: "Lee" },
          });
        }
        return jsonResponse({}, 404);
      },
    });
    store.syncRuns.push({
      id: 9,
      kind: "ats_applications",
      status: "checkpointed",
      checkpoint: {
        phase: "details",
        listPage: 3,
        lastListId: "200",
        lastDetailId: null,
        lastResumeId: null,
        listed: 2,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: true,
        detailsRequeued: true,
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      onlyMissing: true,
      resumeFrom: "100",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(requested).toEqual(["200"]);
  });

  test("requeue-details still refreshes when resuming an only-missing checkpoint", async () => {
    const store = new FakeAtsStore();
    store.candidates.push({
      id: 50,
      bambooId: "40316",
      jobOpeningId: 10,
      atsDetailImportedAt: "2024-01-01T00:00:00Z",
    });
    let detailCalls = 0;
    const inner = mockAtsFetch();
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input, init) => {
        if (String(input).includes("/applicant_tracking/applications/40316")) {
          detailCalls += 1;
        }
        return inner(input, init);
      },
    });
    store.syncRuns.push({
      id: 8,
      kind: "ats_applications",
      status: "checkpointed",
      checkpoint: {
        phase: "details",
        listPage: 3,
        lastListId: "40316",
        lastDetailId: null,
        lastResumeId: null,
        listed: 1,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: true,
        detailsRequeued: true,
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      requeueDetails: true,
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(detailCalls).toBeGreaterThan(0);
    expect(store.answers.length).toBeGreaterThan(0);
  });

  test("resume-from compares Bamboo ids numerically", async () => {
    expect(laterBambooApplicationId("99999", "100000")).toBe("100000");
    const store = new FakeAtsStore();
    store.candidates.push(
      {
        id: 1,
        bambooId: "9999",
        jobOpeningId: 10,
        atsDetailImportedAt: null,
      },
      {
        id: 2,
        bambooId: "100000",
        jobOpeningId: 10,
        atsDetailImportedAt: null,
      }
    );
    const requested: string[] = [];
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/applicant_tracking/statuses")) {
          return jsonResponse({ applicationStatuses: [] });
        }
        if (url.includes("/applicant_tracking/applications?")) {
          return jsonResponse({ applications: [], paginationComplete: true });
        }
        const match = url.match(/applications\/(\d+)$/);
        if (match) {
          requested.push(match[1]);
          return jsonResponse({
            id: Number(match[1]),
            job: { id: 22, title: "Engineer" },
            applicant: { firstName: "Pat", lastName: "Lee" },
          });
        }
        return jsonResponse({}, 404);
      },
    });
    store.syncRuns.push({
      id: 11,
      kind: "ats_applications",
      status: "checkpointed",
      checkpoint: {
        phase: "details",
        listPage: 2,
        lastListId: "100000",
        lastDetailId: null,
        lastResumeId: null,
        listed: 2,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: true,
        detailsRequeued: true,
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      onlyMissing: true,
      resumeFrom: "99999",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(requested).toEqual(["100000"]);
  });

  test("details phase uses bounded concurrency of 8 by default", async () => {
    const store = new FakeAtsStore();
    const ids = Array.from({ length: 16 }, (_, index) => String(1000 + index));
    store.candidates = ids.map((bambooId, index) => ({
      id: index + 1,
      bambooId,
      jobOpeningId: 10,
      atsDetailImportedAt: null,
    }));
    let inflight = 0;
    let maxInflight = 0;
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/applicant_tracking/statuses")) {
          return jsonResponse({ applicationStatuses: [] });
        }
        if (url.includes("/applicant_tracking/applications?")) {
          return jsonResponse({ applications: [], paginationComplete: true });
        }
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inflight -= 1;
        const match = url.match(/applications\/(\d+)$/);
        return jsonResponse({
          id: Number(match?.[1] || 0),
          job: { id: 22, title: "Engineer" },
          applicant: { firstName: "Pat", lastName: "Lee" },
        });
      },
    });
    store.syncRuns.push({
      id: 3,
      kind: "ats_applications",
      status: "checkpointed",
      checkpoint: {
        phase: "details",
        listPage: 2,
        lastListId: ids[ids.length - 1],
        lastDetailId: null,
        lastResumeId: null,
        listed: ids.length,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: true,
        detailsRequeued: true,
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      onlyMissing: true,
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(maxInflight).toBeGreaterThan(2);
    expect(maxInflight).toBeLessThanOrEqual(8);
  });

  test("details logs progress with a rate and a heartbeat without PII", async () => {
    const store = new FakeAtsStore();
    store.candidates.push({
      id: 1,
      bambooId: "40316",
      jobOpeningId: 10,
      atsDetailImportedAt: null,
    });
    const logs: string[] = [];
    const hung = {
      resolve() {},
    };
    const hungPromise = new Promise<void>((resolve) => {
      hung.resolve = resolve;
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      timeoutMs: 200,
      maxRetries: 0,
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/applicant_tracking/statuses")) {
          return jsonResponse({ applicationStatuses: [] });
        }
        if (url.includes("/applicant_tracking/applications?")) {
          return jsonResponse({ applications: [], paginationComplete: true });
        }
        if (url.includes("/applicant_tracking/applications/40316")) {
          await hungPromise;
          return jsonResponse({
            id: 40316,
            job: { id: 22, title: "Engineer" },
            applicant: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
          });
        }
        return jsonResponse({}, 404);
      },
    });
    store.syncRuns.push({
      id: 4,
      kind: "ats_applications",
      status: "checkpointed",
      checkpoint: {
        phase: "details",
        listPage: 2,
        lastListId: "40316",
        lastDetailId: null,
        lastResumeId: null,
        listed: 1,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: true,
        detailsRequeued: true,
      },
    });
    const running = runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      onlyMissing: true,
      heartbeatMs: 20,
      log: (message) => logs.push(message),
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(logs.some((line) => /heartbeat/i.test(line))).toBe(true);
    expect(logs.some((line) => /rate=.*eta=/i.test(line))).toBe(true);
    expect(logs.join("\n")).not.toMatch(/ada@example.com/i);
    hung.resolve();
    const result = await running;
    expect(["success", "failed"]).toContain(result.status);
  });

  test("details progress logs rate and ETA without PII", () => {
    expect(BAMBOO_ATS_DETAIL_CONCURRENCY).toBe(8);
    const line = formatAtsDetailsProgress({
      processed: 2475,
      listed: 88512,
      startedAtMs: 0,
      nowMs: 10 * 60_000,
      inFlight: 8,
      lastId: "40316",
      heartbeat: true,
    });
    expect(line).toContain("ATS details heartbeat");
    expect(line).toContain("processed=2475");
    expect(line).toContain("rate=248/min");
    expect(line).toContain("eta=5h 47m");
    expect(line).toContain("in-flight=8");
    expect(line).toContain("lastId=40316");
    expect(line).not.toMatch(/@|ssn|ada/i);
  });

  test("imports status history from documented GET details and does not POST comments", async () => {
    const store = new FakeAtsStore();
    store.candidates.push({
      id: 1,
      bambooId: "92654",
      jobOpeningId: 10,
      atsDetailImportedAt: null,
    });
    const methods: string[] = [];
    const logs: string[] = [];
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        methods.push(`${method} ${url.replace(/^https:\/\/[^/]+/, "")}`);
        if (url.includes("/applicant_tracking/statuses")) {
          return jsonResponse({ applicationStatuses: [] });
        }
        if (/\/applicant_tracking\/applications\/92654\/comments$/.test(url)) {
          return jsonResponse({ error: "not found" }, 404);
        }
        if (/\/applicant_tracking\/applications\/92654$/.test(url)) {
          return jsonResponse({
            id: 92654,
            appliedDate: "2024-01-15T14:30:00Z",
            status: {
              id: 3,
              label: "Interview",
              dateChanged: "2024-01-18T09:15:00Z",
              changedByUser: { id: 12, firstName: "Pat", lastName: "Kim" },
            },
            commentCount: 3,
            questionsAndAnswers: [
              {
                question: { id: 11, label: "Work authorization?" },
                answer: { id: 21, label: "Yes" },
              },
            ],
            applicant: { firstName: "Jordan", lastName: "Lee", email: "jordan.lee@example.com" },
            job: { id: 22, title: "Engineer" },
          });
        }
        return jsonResponse({ error: url }, 404);
      },
    });
    store.syncRuns.push({
      id: 11,
      kind: "ats_applications",
      status: "checkpointed",
      checkpoint: {
        phase: "details",
        listPage: 2,
        lastListId: "92654",
        lastDetailId: null,
        lastResumeId: null,
        listed: 1,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: true,
        detailsRequeued: true,
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      onlyMissing: true,
      log: (message) => logs.push(message),
    });
    expect(result.status).toBe("success");
    expect(store.emailsSent).toBe(0);
    expect(store.webhookCalls).toBe(0);
    expect(store.answers).toHaveLength(1);
    expect(store.comments).toHaveLength(0);
    expect(store.history.length).toBeGreaterThan(0);
    expect(store.history.some((row) => row.statusLabel === "Interview")).toBe(true);
    expect(methods.every((row) => row.startsWith("GET "))).toBe(true);
    expect(methods.some((row) => row.includes("/applications/92654/comments"))).toBe(true);
    expect(logs.join("\n")).toMatch(/comment bodies are not on a public GET endpoint/i);
    expect(logs.join("\n")).not.toMatch(/jordan\.lee@example\.com|test-key/i);
    expect(JSON.stringify(store.syncRuns)).not.toMatch(/jordan\.lee@example\.com/i);
  });

  test("maps comment bodies when GET /applications/{id}/comments exists", async () => {
    const store = new FakeAtsStore();
    store.candidates.push({
      id: 1,
      bambooId: "92654",
      jobOpeningId: 10,
      atsDetailImportedAt: null,
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/applicant_tracking/statuses")) {
          return jsonResponse({ applicationStatuses: [] });
        }
        if (/\/applicant_tracking\/applications\/92654\/comments$/.test(url)) {
          return jsonResponse({
            comments: [
              {
                id: 44,
                comment: "Strong hire",
                author: { firstName: "Sam", lastName: "Lee" },
                created: "2024-01-19T00:00:00Z",
              },
            ],
          });
        }
        if (/\/applicant_tracking\/applications\/92654$/.test(url)) {
          return jsonResponse({
            id: 92654,
            status: { id: 3, label: "Interview", dateChanged: "2024-01-18T09:15:00Z" },
            commentCount: 1,
            applicant: { firstName: "Jordan", lastName: "Lee" },
            job: { id: 22, title: "Engineer" },
          });
        }
        return jsonResponse({ error: url }, 404);
      },
    });
    store.syncRuns.push({
      id: 12,
      kind: "ats_applications",
      status: "checkpointed",
      checkpoint: {
        phase: "details",
        listPage: 2,
        lastListId: "92654",
        lastDetailId: null,
        lastResumeId: null,
        listed: 1,
        detailed: 0,
        resumes: 0,
        answers: 0,
        comments: 0,
        history: 0,
        newSince: null,
        paginationComplete: true,
        detailsRequeued: true,
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: false,
      onlyMissing: true,
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(store.comments).toEqual([
      expect.objectContaining({
        bambooId: "44",
        content: "Strong hire",
        authorName: "Sam Lee",
      }),
    ]);
  });

  test("backfills only comments/history for already-imported applications after --resume-from", async () => {
    const store = new FakeAtsStore();
    store.candidates.push(
      {
        id: 1,
        bambooId: "100",
        jobOpeningId: 10,
        atsDetailImportedAt: "2026-11-20T00:00:00.000Z",
      },
      {
        id: 2,
        bambooId: "82017",
        jobOpeningId: 10,
        atsDetailImportedAt: "2026-11-20T00:00:00.000Z",
      },
      {
        id: 3,
        bambooId: "92654",
        jobOpeningId: 10,
        atsDetailImportedAt: "2026-11-20T00:00:00.000Z",
      }
    );
    const fetched: string[] = [];
    const methods: string[] = [];
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: async (input, init) => {
        const url = String(input);
        methods.push((init?.method || "GET").toUpperCase());
        if (url.includes("/applicant_tracking/statuses")) {
          return jsonResponse({ applicationStatuses: [] });
        }
        const commentsMatch = url.match(/\/applicant_tracking\/applications\/(\d+)\/comments$/);
        if (commentsMatch) {
          return jsonResponse({ error: "not found" }, 404);
        }
        const detailMatch = url.match(/\/applicant_tracking\/applications\/(\d+)$/);
        if (detailMatch) {
          fetched.push(detailMatch[1]);
          return jsonResponse({
            id: Number(detailMatch[1]),
            appliedDate: "2024-01-15T14:30:00Z",
            status: {
              id: 3,
              label: "Interview",
              dateChanged: "2024-01-18T09:15:00Z",
              changedByUser: { firstName: "Pat", lastName: "Kim" },
            },
            commentCount: 2,
            questionsAndAnswers: [
              {
                question: { id: 11, label: "Work authorization?" },
                answer: { id: 21, label: "Yes" },
              },
            ],
            applicant: { firstName: "Jordan", lastName: "Lee", email: "jordan.lee@example.com" },
            job: { id: 22, title: "Engineer" },
          });
        }
        return jsonResponse({ error: url }, 404);
      },
    });
    const result = await runAtsApplicationsSync({
      client,
      store: store as unknown as BambooSyncStore,
      blob: null,
      mode: "full",
      importResumes: true,
      backfillCommentsHistory: true,
      resumeFrom: "82016",
      log: () => undefined,
    });
    expect(result.status).toBe("success");
    expect(result.checkpoint.backfillCommentsHistory).toBe(true);
    expect(fetched.sort()).toEqual(["82017", "92654"]);
    expect(store.answers).toHaveLength(0);
    expect(store.comments).toHaveLength(0);
    expect(store.history.length).toBeGreaterThanOrEqual(2);
    expect(store.emailsSent).toBe(0);
    expect(store.webhookCalls).toBe(0);
    expect(methods.every((method) => method === "GET")).toBe(true);
    expect(store.candidates.every((row) => row.atsDetailImportedAt)).toBe(true);
  });

  test("refuses POST application comments and stays GET-only", async () => {
    const client = new BambooHrClient({
      apiKey: "secret-api-key",
      subdomain: "vendasta",
      fetch: async () => {
        throw new Error("network should not be called for writes");
      },
    });
    await expect(
      (
        client as unknown as {
          request: (path: string, init?: RequestInit) => Promise<unknown>;
        }
      ).request("/applicant_tracking/applications/92654/comments", {
        method: "POST",
        body: JSON.stringify({ type: "comment", comment: "hi" }),
      })
    ).rejects.toThrow(/read-only/i);
  });
});

describe("public careers never expose applicants", () => {
  test("DTO still drops candidate fields after ATS import columns exist", () => {
    const mapped = toPublicCareerOpening({
      id: 9,
      title: "Software Engineer",
      employmentType: "full_time",
      description: "Build HR tools",
      requirements: "TypeScript",
      openDate: "2026-11-01",
      departmentName: "Engineering",
      locationName: "Saskatoon",
      ...({
        candidateEmail: "ada@example.com",
        resumeBlobUrl: "https://blob.vercel-storage.com/secret",
        coverLetter: "please hire me",
        applicantCount: 88507,
      } as Record<string, unknown>),
    });
    expect(JSON.stringify(mapped)).not.toMatch(/ada@|resumeBlob|coverLetter|88507|applicant/i);
  });
});
