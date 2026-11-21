import {
  ATS_APPLICATIONS_MAX_PAGES,
  BAMBOO_ATS_DETAIL_CONCURRENCY,
  BambooHrClient,
  BambooHrHttpError,
  parseBoundedConcurrency,
} from "./client";
import { mapPool } from "./pool";
import {
  atsResumeBlobPath,
  BAMBOO_RESUME_UNAVAILABLE,
  type PrivateBlobStore,
} from "./blob";
import { asRecord } from "./map-extended";
import {
  emptyAtsDatasetCounts,
  formatBambooNewSince,
  mapAtsAnswers,
  mapAtsApplication,
  mapAtsComments,
  mapAtsStatusHistory,
} from "./map-ats";
import type { BambooSyncStore } from "./sync";
import type { BatchProgress } from "./chunks";
import {
  laterBambooApplicationId,
  ATS_RESUMES_ONLY_KIND,
  ATS_RESUMES_ONLY_MAX_LIMIT,
  type AtsDatasetCounts,
  type AtsSyncCheckpoint,
  type BambooAtsSyncResult,
  type BambooSyncMode,
  type MappedAtsApplicationWrite,
} from "./types";

const PII_LOG_PATTERN =
  /(\b\d{3}-\d{2}-\d{4}\b)|(\$\s?\d)|(@[a-z0-9.-]+\.[a-z]{2,})/i;

export type AtsSyncLogger = (message: string) => void;

export type RunAtsApplicationsSyncOptions = {
  client: BambooHrClient | null;
  store: BambooSyncStore;
  blob?: PrivateBlobStore | null;
  mode: BambooSyncMode;
  dryRun?: boolean;
  importResumes?: boolean;
  onlyMissing?: boolean;
  requeueDetails?: boolean;
  resumeFrom?: string | null;
  backfillCommentsHistory?: boolean;
  resumesOnly?: boolean;
  limitRecent?: number | null;
  log?: AtsSyncLogger;
  now?: Date;
  concurrency?: number;
  heartbeatMs?: number;
  maxListPages?: number;
  maxMs?: number;
  writeChunkSize?: number;
};

export const BAMBOO_ATS_DETAIL_HEARTBEAT_MS = 15_000;
export const BAMBOO_ATS_RESUME_CONCURRENCY = 2;
export { ATS_RESUMES_ONLY_KIND, ATS_RESUMES_ONLY_MAX_LIMIT };

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatAtsDetailsProgress(input: {
  processed: number;
  listed: number;
  startedAtMs: number;
  nowMs?: number;
  inFlight: number;
  lastId: string | null;
  heartbeat?: boolean;
}): string {
  const elapsedMs = Math.max(0, (input.nowMs ?? Date.now()) - input.startedAtMs);
  const elapsedMinutes = elapsedMs / 60_000;
  const rate = elapsedMinutes > 0 ? input.processed / elapsedMinutes : 0;
  const remaining = Math.max(input.listed - input.processed, 0);
  const eta =
    rate > 0 && remaining > 0
      ? formatDurationMs((remaining / rate) * 60_000)
      : remaining === 0
        ? "0s"
        : "unknown";
  return [
    input.heartbeat ? "ATS details heartbeat" : "ATS details",
    `processed=${input.processed}`,
    `remaining~${remaining}`,
    `rate=${rate.toFixed(0)}/min`,
    `eta=${eta}`,
    `in-flight=${input.inFlight}`,
    `lastId=${input.lastId || "none"}`,
  ].join(" ");
}

function startHeartbeat(onTick: () => void, ms: number): () => void {
  if (!(ms > 0)) return () => undefined;
  const timer = setInterval(onTick, ms);
  timer.unref?.();
  return () => clearInterval(timer);
}

function safeLog(log: AtsSyncLogger, message: string) {
  if (PII_LOG_PATTERN.test(message)) {
    log("sync log redacted");
    return;
  }
  log(message);
}

function emptyCheckpoint(newSince: string | null): AtsSyncCheckpoint {
  return {
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
    newSince,
    paginationComplete: false,
    detailsRequeued: false,
    backfillCommentsHistory: false,
    resumesOnly: false,
  };
}

function asCheckpoint(value: Record<string, unknown> | null | undefined, fallbackNewSince: string | null): AtsSyncCheckpoint {
  if (!value) return emptyCheckpoint(fallbackNewSince);
  const phase = value.phase;
  return {
    phase:
      phase === "details" || phase === "resumes" || phase === "done" || phase === "list"
        ? phase
        : "list",
    listPage: Number(value.listPage) > 0 ? Number(value.listPage) : 1,
    lastListId: typeof value.lastListId === "string" ? value.lastListId : null,
    lastDetailId: typeof value.lastDetailId === "string" ? value.lastDetailId : null,
    lastResumeId: typeof value.lastResumeId === "string" ? value.lastResumeId : null,
    listed: Number(value.listed) || 0,
    detailed: Number(value.detailed) || 0,
    resumes: Number(value.resumes) || 0,
    answers: Number(value.answers) || 0,
    comments: Number(value.comments) || 0,
    history: Number(value.history) || 0,
    newSince:
      typeof value.newSince === "string"
        ? value.newSince
        : fallbackNewSince,
    paginationComplete: value.paginationComplete === true,
    detailsRequeued: value.detailsRequeued === true,
    backfillCommentsHistory: value.backfillCommentsHistory === true,
    resumesOnly: value.resumesOnly === true,
    limitRecent:
      Number.isInteger(Number(value.limitRecent)) && Number(value.limitRecent) > 0
        ? Number(value.limitRecent)
        : undefined,
    selectedResumeIds: Array.isArray(value.selectedResumeIds)
      ? value.selectedResumeIds.filter((id): id is string => typeof id === "string")
      : undefined,
    skippedExistingResume: Number(value.skippedExistingResume) || 0,
    missingResumeFile: Number(value.missingResumeFile) || 0,
    pendingResumes: Number(value.pendingResumes) || 0,
  };
}

function countsFrom(checkpoint: AtsSyncCheckpoint): AtsDatasetCounts {
  return {
    applications: checkpoint.listed,
    answers: checkpoint.answers,
    comments: checkpoint.comments,
    statusHistory: checkpoint.history,
    resumes: checkpoint.resumes,
  };
}

function progress(_label: string, chunkSize?: number): BatchProgress {
  return { chunkSize };
}

function boundedLimitRecent(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (Number.isInteger(value) && value >= 1 && value <= ATS_RESUMES_ONLY_MAX_LIMIT) {
    return value;
  }
  return null;
}

async function storeResumeFromBamboo(opts: {
  client: BambooHrClient;
  blob: PrivateBlobStore;
  store: BambooSyncStore;
  row: { bambooId: string; resumeBambooFileId: string };
  log: AtsSyncLogger;
}): Promise<"stored" | "unavailable"> {
  try {
    const file = await opts.client.fetchFile(opts.row.resumeBambooFileId);
    const stored = await opts.blob.putPrivate({
      pathname: atsResumeBlobPath(opts.row.bambooId, file.filename || "resume"),
      body: file.body,
      contentType: file.contentType,
    });
    await opts.store.setCandidateResumeBlob(opts.row.bambooId, stored.url);
    return "stored";
  } catch (error) {
    if (error instanceof BambooHrHttpError && error.status === 404) {
      opts.log(`resume file missing bambooFileId=${opts.row.resumeBambooFileId}`);
      await opts.store.setCandidateResumeBlob(
        opts.row.bambooId,
        BAMBOO_RESUME_UNAVAILABLE
      );
      return "unavailable";
    }
    throw error;
  }
}

function classifyResumeWindow(
  rows: Array<{
    bambooId: string;
    resumeBambooFileId: string | null;
    resumeBlobUrl: string | null;
  }>,
  lastResumeId: string | null
) {
  const pending: Array<{ bambooId: string; resumeBambooFileId: string }> = [];
  let skippedExistingResume = 0;
  let missingResumeFile = 0;
  let passedCursor = !lastResumeId;
  for (const row of rows) {
    if (!passedCursor) {
      if (row.bambooId === lastResumeId) passedCursor = true;
      continue;
    }
    if (row.resumeBlobUrl) {
      skippedExistingResume += 1;
      continue;
    }
    if (!row.resumeBambooFileId) {
      missingResumeFile += 1;
      continue;
    }
    pending.push({
      bambooId: row.bambooId,
      resumeBambooFileId: row.resumeBambooFileId,
    });
  }
  return { pending, skippedExistingResume, missingResumeFile };
}

async function runAtsResumesOnlySync(
  opts: RunAtsApplicationsSyncOptions
): Promise<BambooAtsSyncResult> {
  const log: AtsSyncLogger = (message) => {
    if (opts.log) safeLog(opts.log, message);
  };
  const dryRun = Boolean(opts.dryRun);
  const startedAt = (opts.now ?? new Date()).toISOString();
  const deadline = opts.maxMs != null ? Date.now() + opts.maxMs : null;
  const timedOut = () => deadline != null && Date.now() >= deadline;
  const concurrency = parseBoundedConcurrency(
    opts.concurrency != null ? String(opts.concurrency) : undefined,
    BAMBOO_ATS_RESUME_CONCURRENCY
  );
  const limitRecent = boundedLimitRecent(opts.limitRecent ?? null);

  const empty = emptyCheckpoint(null);
  empty.phase = "resumes";
  empty.resumesOnly = true;
  empty.limitRecent = limitRecent ?? undefined;

  const failed = (
    checkpoint: AtsSyncCheckpoint,
    message: string
  ): BambooAtsSyncResult => ({
    status: "failed",
    dryRun,
    kind: ATS_RESUMES_ONLY_KIND,
    mode: opts.mode,
    datasetCounts: countsFrom(checkpoint),
    checkpoint,
    errorMessage: message,
  });

  const resultOf = (
    status: BambooAtsSyncResult["status"],
    checkpoint: AtsSyncCheckpoint,
    errorMessage?: string
  ): BambooAtsSyncResult => ({
    status,
    dryRun,
    kind: ATS_RESUMES_ONLY_KIND,
    mode: opts.mode,
    datasetCounts: countsFrom(checkpoint),
    checkpoint,
    errorMessage,
  });

  if (limitRecent == null) {
    return failed(empty, "--limit-recent is required for --ats-resumes-only (1-5000)");
  }
  empty.limitRecent = limitRecent;

  if (!opts.client) {
    log("BAMBOOHR_API_KEY is unset; ATS resumes-only sync skipped");
    return resultOf("skipped", empty);
  }

  let incomplete = dryRun
    ? null
    : await opts.store.lastIncompleteKindCheckpoint(ATS_RESUMES_ONLY_KIND);
  let checkpoint = asCheckpoint(incomplete?.checkpoint, null);
  if (
    checkpoint.resumesOnly !== true ||
    checkpoint.limitRecent !== limitRecent ||
    !Array.isArray(checkpoint.selectedResumeIds)
  ) {
    incomplete = null;
    checkpoint = empty;
  }

  let runId = incomplete?.id ?? null;
  if (!dryRun && runId == null) {
    runId = await opts.store.startSyncRun({
      kind: ATS_RESUMES_ONLY_KIND,
      mode: opts.mode,
      status: "running",
      startedAt,
      checkpoint,
      datasetCounts: countsFrom(checkpoint),
    });
  }

  const persist = async (
    status: "running" | "checkpointed" | "success" | "failed",
    errorMessage?: string
  ) => {
    if (dryRun || runId == null) return;
    await opts.store.updateSyncRun(runId, {
      status,
      finishedAt: status === "running" ? null : new Date().toISOString(),
      checkpoint,
      datasetCounts: countsFrom(checkpoint),
      errorMessage,
    });
  };

  try {
    if (!checkpoint.selectedResumeIds) {
      const recent = await opts.store.listRecentDetailedCandidatesForResumes(limitRecent);
      checkpoint.selectedResumeIds = recent.map((row) => row.bambooId);
    }
    checkpoint.listed = checkpoint.selectedResumeIds.length;
    checkpoint.limitRecent = limitRecent;
    checkpoint.resumesOnly = true;
    checkpoint.phase = "resumes";

    const ordered = await opts.store.listCandidatesResumeState(
      checkpoint.selectedResumeIds
    );
    const classified = classifyResumeWindow(ordered, checkpoint.lastResumeId);
    checkpoint.skippedExistingResume = classified.skippedExistingResume;
    checkpoint.missingResumeFile = classified.missingResumeFile;
    checkpoint.pendingResumes = classified.pending.length;

    if (dryRun) {
      log(
        `ATS resumes-only dry-run selected=${checkpoint.listed} skippedExistingResume=${classified.skippedExistingResume} missingResumeFile=${classified.missingResumeFile} pending=${classified.pending.length}`
      );
      checkpoint.phase = "done";
      return resultOf("success", checkpoint);
    }

    if (!opts.blob) {
      log("BLOB_READ_WRITE_TOKEN unset; skipping resume blobs");
      checkpoint.phase = "done";
      await persist("success");
      return resultOf("success", checkpoint);
    }

    log(
      `Phase resumes-only: selected=${checkpoint.listed} pending=${classified.pending.length} concurrency=${concurrency}`
    );

    const batchSize = Math.max(concurrency, 1);
    const pending = classified.pending;
    for (let index = 0; index < pending.length; ) {
      if (index > 0 && timedOut()) {
        await persist("checkpointed");
        return resultOf("checkpointed", checkpoint);
      }
      const batch = pending.slice(index, index + batchSize);
      const outcomes = await mapPool(batch, concurrency, async (row) =>
        storeResumeFromBamboo({
          client: opts.client!,
          blob: opts.blob!,
          store: opts.store,
          row,
          log,
        })
      );
      checkpoint.resumes += outcomes.filter((outcome) => outcome === "stored").length;
      checkpoint.lastResumeId =
        batch[batch.length - 1]?.bambooId ?? checkpoint.lastResumeId;
      checkpoint.pendingResumes = Math.max(pending.length - (index + batch.length), 0);
      log(
        `ATS resumes-only stored=${checkpoint.resumes} lastId=${checkpoint.lastResumeId || "none"}`
      );
      await persist("running");
      index += batch.length;
    }

    checkpoint.phase = "done";
    checkpoint.pendingResumes = 0;
    await persist("success");
    log(
      `ATS resumes-only selected=${checkpoint.listed} stored=${checkpoint.resumes}`
    );
    return resultOf("success", checkpoint);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.replace(PII_LOG_PATTERN, "[redacted]")
        : "ATS resumes-only sync failed";
    log(`ATS resumes-only sync failed: ${message}`);
    await persist("failed", message);
    return failed(checkpoint, message);
  }
}

async function ensureJobOpenings(
  store: BambooSyncStore,
  mapped: MappedAtsApplicationWrite[],
  jobIds: Map<string, number>
) {
  const missing = mapped.filter((row) => !jobIds.has(row.jobBambooId));
  if (missing.length === 0) return jobIds;
  const stubs = new Map<string, MappedAtsApplicationWrite>();
  for (const row of missing) {
    if (!stubs.has(row.jobBambooId)) stubs.set(row.jobBambooId, row);
  }
  await store.upsertJobOpeningsBatch(
    [...stubs.values()].map((row) => ({
      bambooId: row.jobBambooId,
      title: row.jobTitle,
      departmentId: null,
      locationId: null,
      hiringLeadId: null,
      status: "draft" as const,
      bambooStatusId: null,
      bambooStatusLabel: null,
      employmentType: "full_time",
      description: null,
      requirements: null,
      openDate: null,
      closeDate: null,
    })),
    progress("job_opening_stubs")
  );
  const refreshed = await store.listJobOpeningIdsByBambooId();
  for (const [id, value] of refreshed) jobIds.set(id, value);
  return jobIds;
}

export async function runAtsApplicationsSync(
  opts: RunAtsApplicationsSyncOptions
): Promise<BambooAtsSyncResult> {
  if (opts.resumesOnly) {
    return runAtsResumesOnlySync(opts);
  }
  const log: AtsSyncLogger = (message) => {
    if (opts.log) safeLog(opts.log, message);
  };
  const dryRun = Boolean(opts.dryRun);
  const startedAt = (opts.now ?? new Date()).toISOString();
  const deadline = opts.maxMs != null ? Date.now() + opts.maxMs : null;
  const timedOut = () => deadline != null && Date.now() >= deadline;
  const backfillCommentsHistory = Boolean(opts.backfillCommentsHistory);
  const importResumes = opts.importResumes !== false && !backfillCommentsHistory;
  const onlyMissing = opts.onlyMissing !== false && opts.requeueDetails !== true;
  const concurrency = parseBoundedConcurrency(
    opts.concurrency != null ? String(opts.concurrency) : undefined,
    BAMBOO_ATS_DETAIL_CONCURRENCY
  );
  const heartbeatMs = opts.heartbeatMs ?? BAMBOO_ATS_DETAIL_HEARTBEAT_MS;
  const detailBatchSize = Math.max(concurrency * 4, 24);

  const failed = (
    checkpoint: AtsSyncCheckpoint,
    message: string
  ): BambooAtsSyncResult => ({
    status: "failed",
    dryRun,
    kind: "ats_applications",
    mode: opts.mode,
    datasetCounts: countsFrom(checkpoint),
    checkpoint,
    errorMessage: message,
  });

  if (!opts.client) {
    log("BAMBOOHR_API_KEY is unset; ATS applications sync skipped");
    return {
      status: "skipped",
      dryRun,
      kind: "ats_applications",
      mode: opts.mode,
      datasetCounts: emptyAtsDatasetCounts(),
      checkpoint: emptyCheckpoint(null),
    };
  }

  const newSince =
    opts.mode === "incremental"
      ? formatBambooNewSince(
          new Date(
            (await opts.store.lastSuccessfulAtsCursor()) || "2010-01-01T00:00:00Z"
          )
        )
      : null;

  const existingAtsCursor = dryRun ? null : await opts.store.lastSuccessfulAtsCursor();
  let incomplete = dryRun ? null : await opts.store.lastIncompleteAtsCheckpoint();
  let checkpoint = asCheckpoint(incomplete?.checkpoint, newSince);
  if (Boolean(checkpoint.backfillCommentsHistory) !== backfillCommentsHistory) {
    incomplete = null;
    checkpoint = emptyCheckpoint(backfillCommentsHistory ? null : newSince);
  }
  const freshFull = opts.mode === "full" && !incomplete && !backfillCommentsHistory;
  if (opts.mode === "incremental" && !incomplete && !backfillCommentsHistory) {
    checkpoint = emptyCheckpoint(newSince);
  }
  if (freshFull) {
    checkpoint = emptyCheckpoint(null);
  }
  if (backfillCommentsHistory) {
    checkpoint.backfillCommentsHistory = true;
    checkpoint.paginationComplete = true;
    if (checkpoint.phase === "list") checkpoint.phase = "details";
    if (checkpoint.phase === "resumes") checkpoint.phase = "done";
  }

  let runId = incomplete?.id ?? null;
  if (!dryRun && runId == null) {
    runId = await opts.store.startSyncRun({
      kind: "ats_applications",
      mode: opts.mode,
      status: "running",
      startedAt,
      latestChanged: checkpoint.newSince,
      checkpoint,
      datasetCounts: countsFrom(checkpoint),
    });
  }

  const persist = async (status: "running" | "checkpointed" | "success" | "failed", errorMessage?: string) => {
    if (dryRun || runId == null) return;
    await opts.store.updateSyncRun(runId, {
      status,
      finishedAt: status === "running" ? null : new Date().toISOString(),
      latestChanged: backfillCommentsHistory
        ? existingAtsCursor
        : opts.mode === "incremental"
          ? formatBambooNewSince(opts.now ?? new Date())
          : checkpoint.newSince,
      checkpoint,
      datasetCounts: countsFrom(checkpoint),
      errorMessage,
    });
  };

  try {
    const statuses = await opts.client.fetchAtsStatuses();
    const statusesById = new Map(
      statuses.map((status) => [
        status.id,
        { code: status.code, name: status.name, kind: status.kind },
      ])
    );
    let jobIds = await opts.store.listJobOpeningIdsByBambooId();
    const listedIds: string[] = [];
    const pageBudget = Math.min(
      opts.maxListPages ?? ATS_APPLICATIONS_MAX_PAGES,
      ATS_APPLICATIONS_MAX_PAGES
    );
    const lastListPage = Math.min(
      checkpoint.listPage + pageBudget - 1,
      ATS_APPLICATIONS_MAX_PAGES
    );

    if (checkpoint.phase === "list") {
      log(
        `Phase list: ATS applications page ${checkpoint.listPage} newSince=${checkpoint.newSince || "none"}`
      );
      for (let page = checkpoint.listPage; page <= lastListPage; page += 1) {
        if (timedOut()) {
          checkpoint.listPage = page;
          await persist("checkpointed");
          log(`checkpointed list page=${page} listed=${checkpoint.listed}`);
          return {
            status: "checkpointed",
            dryRun,
            kind: "ats_applications",
            mode: opts.mode,
            datasetCounts: countsFrom(checkpoint),
            checkpoint,
          };
        }
        const listed = await opts.client.fetchAtsApplicationsPage({
          page,
          newSince: checkpoint.newSince,
        });
        const mapped = listed.applications
          .map((row) => mapAtsApplication(row, statusesById))
          .filter((row): row is MappedAtsApplicationWrite => Boolean(row));
        log(`ATS applications page=${page} count=${mapped.length}`);
        if (!dryRun && mapped.length > 0) {
          jobIds = await ensureJobOpenings(opts.store, mapped, jobIds);
          const rows = mapped.flatMap((row) => {
            const jobOpeningId = jobIds.get(row.jobBambooId);
            if (jobOpeningId == null) return [];
            return [
              {
                bambooId: row.bambooId,
                jobOpeningId,
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email,
                phone: row.phone,
                linkedinUrl: row.linkedinUrl,
                source: row.source,
                sourceDetail: row.sourceDetail,
                stage: row.stage,
                bambooStatusId: row.bambooStatusId,
                bambooStatusLabel: row.bambooStatusLabel,
                rating: row.rating,
                appliedAt: row.appliedAt,
                coverLetter: row.coverLetter,
                resumeBambooFileId: row.resumeBambooFileId,
                resumeBlobUrl: null,
                atsDetailImportedAt: null,
              },
            ];
          });
          await opts.store.upsertCandidatesBatch(
            rows,
            progress("candidates", opts.writeChunkSize)
          );
        }
        checkpoint.listed += mapped.length;
        checkpoint.listPage = page + 1;
        checkpoint.lastListId = mapped[mapped.length - 1]?.bambooId ?? checkpoint.lastListId;
        listedIds.push(...mapped.map((row) => row.bambooId));
        checkpoint.paginationComplete = listed.paginationComplete;
        await persist("running");
        if (listed.paginationComplete) break;
      }
      if (!checkpoint.paginationComplete) {
        await persist("checkpointed");
        log(`checkpointed list page=${checkpoint.listPage} listed=${checkpoint.listed}`);
        return {
          status: "checkpointed",
          dryRun,
          kind: "ats_applications",
          mode: opts.mode,
          datasetCounts: countsFrom(checkpoint),
          checkpoint,
        };
      }
      checkpoint.phase = "details";
      await persist("running");
    }

    if (checkpoint.phase === "details") {
      log(
        backfillCommentsHistory
          ? "Phase details: backfill application comments and status history only"
          : "Phase details: ATS application Q&A, comments, history"
      );
      const shouldRequeue =
        !dryRun &&
        !backfillCommentsHistory &&
        opts.mode === "full" &&
        (opts.requeueDetails === true ||
          (!onlyMissing && !checkpoint.detailsRequeued));
      if (shouldRequeue) {
        await opts.store.requeueCandidateDetails();
        checkpoint.detailsRequeued = true;
        await persist("running");
      }
      let afterDetailId = laterBambooApplicationId(
        opts.resumeFrom,
        checkpoint.lastDetailId
      );
      let inFlight = 0;
      let lastStartedId = checkpoint.lastDetailId;
      const detailsStartedAt = Date.now();
      const logDetailsProgress = (heartbeat = false) => {
        log(
          formatAtsDetailsProgress({
            processed: checkpoint.detailed,
            listed: checkpoint.listed,
            startedAtMs: detailsStartedAt,
            inFlight,
            lastId: lastStartedId,
            heartbeat,
          })
        );
      };
      log(
        `ATS details concurrency=${concurrency} onlyMissing=${onlyMissing} backfillCommentsHistory=${backfillCommentsHistory} resumeFrom=${afterDetailId || "none"}`
      );
      logDetailsProgress();
      let loggedCommentsGap = false;
      const stopHeartbeat = startHeartbeat(
        () => logDetailsProgress(true),
        heartbeatMs
      );
      try {
        while (!dryRun) {
          if (timedOut()) {
            await persist("checkpointed");
            return {
              status: "checkpointed",
              dryRun,
              kind: "ats_applications",
              mode: opts.mode,
              datasetCounts: countsFrom(checkpoint),
              checkpoint,
            };
          }
          const batch = backfillCommentsHistory
            ? await opts.store.listCandidatesForCommentsHistoryBackfill(
                detailBatchSize,
                afterDetailId
              )
            : await opts.store.listCandidatesNeedingDetail(
                detailBatchSize,
                afterDetailId
              );
          if (batch.length === 0) break;
          const details = await mapPool(batch, concurrency, async (row) => {
            inFlight += 1;
            lastStartedId = laterBambooApplicationId(lastStartedId, row.bambooId);
            try {
              const detail = await opts.client!.fetchAtsApplicationDetail(row.bambooId);
              const fromDetail = mapAtsComments(detail, row.bambooId);
              let extraComments: Record<string, unknown>[] = [];
              if (fromDetail.length === 0) {
                const commentCountRaw = asRecord(detail).commentCount;
                const commentCount =
                  typeof commentCountRaw === "number"
                    ? commentCountRaw
                    : Number(commentCountRaw);
                extraComments = await opts.client!.fetchAtsApplicationComments(row.bambooId, {
                  commentCount: Number.isFinite(commentCount) ? commentCount : null,
                });
              }
              return { row, detail, extraComments };
            } catch (error) {
              if (error instanceof BambooHrHttpError && error.status === 404) {
                return { row, detail: { id: row.bambooId }, extraComments: [] };
              }
              throw error;
            } finally {
              inFlight -= 1;
            }
          });
          if (!loggedCommentsGap && opts.client?.atsCommentsEndpointAvailable() === false) {
            loggedCommentsGap = true;
            log(
              "Bamboo ATS GET application details returns commentCount only; comment bodies are not on a public GET endpoint"
            );
          }
          if (!backfillCommentsHistory) {
            const mappedDetails = details.flatMap((item) => {
              const mapped = mapAtsApplication(item.detail, statusesById);
              return mapped ? [{ item, mapped }] : [];
            });
            jobIds = await ensureJobOpenings(
              opts.store,
              mappedDetails.map((row) => row.mapped),
              jobIds
            );
            const nowIso = (opts.now ?? new Date()).toISOString();
            const candidateRows = mappedDetails.flatMap(({ mapped }) => {
              const jobOpeningId = jobIds.get(mapped.jobBambooId);
              if (jobOpeningId == null) return [];
              return [
                {
                  bambooId: mapped.bambooId,
                  jobOpeningId,
                  firstName: mapped.firstName,
                  lastName: mapped.lastName,
                  email: mapped.email,
                  phone: mapped.phone,
                  linkedinUrl: mapped.linkedinUrl,
                  source: mapped.source,
                  sourceDetail: mapped.sourceDetail,
                  stage: mapped.stage,
                  bambooStatusId: mapped.bambooStatusId,
                  bambooStatusLabel: mapped.bambooStatusLabel,
                  rating: mapped.rating,
                  appliedAt: mapped.appliedAt,
                  coverLetter: mapped.coverLetter,
                  resumeBambooFileId: mapped.resumeBambooFileId,
                  resumeBlobUrl: null,
                  atsDetailImportedAt: nowIso,
                },
              ];
            });
            if (candidateRows.length > 0) {
              await opts.store.upsertCandidatesBatch(
                candidateRows,
                progress("candidate_details", opts.writeChunkSize)
              );
            }
            await opts.store.markCandidateDetailImported(batch.map((row) => row.bambooId));
          }
          const answers: Parameters<BambooSyncStore["upsertCandidateAnswersBatch"]>[0] = [];
          const comments: Parameters<BambooSyncStore["upsertCandidateCommentsBatch"]>[0] = [];
          const history: Parameters<BambooSyncStore["upsertCandidateStatusHistoryBatch"]>[0] = [];
          for (const item of details) {
            const candidateId = item.row.id;
            if (!backfillCommentsHistory) {
              for (const answer of mapAtsAnswers(item.detail, item.row.bambooId)) {
                answers.push({ candidateId, ...answer });
              }
            }
            const mappedComments = [
              ...mapAtsComments(item.detail, item.row.bambooId),
              ...mapAtsComments({ comments: item.extraComments }, item.row.bambooId),
            ];
            const seenComments = new Set<string>();
            for (const comment of mappedComments) {
              if (seenComments.has(comment.bambooId)) continue;
              seenComments.add(comment.bambooId);
              comments.push({ candidateId, ...comment });
            }
            for (const event of mapAtsStatusHistory(item.detail, item.row.bambooId)) {
              history.push({ candidateId, ...event });
            }
          }
          if (!backfillCommentsHistory) {
            checkpoint.answers += await opts.store.upsertCandidateAnswersBatch(
              answers,
              progress("candidate_answers", opts.writeChunkSize)
            );
          }
          checkpoint.comments += await opts.store.upsertCandidateCommentsBatch(
            comments,
            progress("candidate_comments", opts.writeChunkSize)
          );
          checkpoint.history += await opts.store.upsertCandidateStatusHistoryBatch(
            history,
            progress("candidate_history", opts.writeChunkSize)
          );
          checkpoint.detailed += batch.length;
          afterDetailId = laterBambooApplicationId(
            afterDetailId,
            batch[batch.length - 1]?.bambooId
          );
          checkpoint.lastDetailId = afterDetailId;
          logDetailsProgress();
          await persist("running");
          if (batch.length < detailBatchSize) break;
        }
      } finally {
        stopHeartbeat();
      }
      checkpoint.phase = importResumes ? "resumes" : "done";
      await persist("running");
    }

    if (checkpoint.phase === "resumes") {
      if (!importResumes || !opts.blob) {
        if (importResumes && !opts.blob) {
          log("BLOB_READ_WRITE_TOKEN unset; skipping resume blobs");
        }
        checkpoint.phase = "done";
      } else {
        log("Phase resumes: private blob upload");
        while (!dryRun) {
          if (timedOut()) {
            await persist("checkpointed");
            return {
              status: "checkpointed",
              dryRun,
              kind: "ats_applications",
              mode: opts.mode,
              datasetCounts: countsFrom(checkpoint),
              checkpoint,
            };
          }
          const batch = await opts.store.listCandidatesNeedingResume(10);
          if (batch.length === 0) break;
          await mapPool(batch, 1, async (row) => {
            const outcome = await storeResumeFromBamboo({
              client: opts.client!,
              blob: opts.blob!,
              store: opts.store,
              row,
              log,
            });
            if (outcome === "stored") checkpoint.resumes += 1;
          });
          checkpoint.lastResumeId = batch[batch.length - 1]?.bambooId ?? checkpoint.lastResumeId;
          log(`ATS resumes stored=${checkpoint.resumes}`);
          await persist("running");
          if (batch.length < 10) break;
        }
        checkpoint.phase = "done";
      }
    }

    if (
      freshFull &&
      !dryRun &&
      checkpoint.paginationComplete &&
      checkpoint.phase === "done" &&
      listedIds.length > 0
    ) {
      log("Phase prune: stale imported applications");
      await opts.store.pruneImportedRowsNotIn(
        "candidates",
        listedIds,
        progress("prune candidates")
      );
    }

    await persist("success");
    log(
      `ATS applications listed=${checkpoint.listed} detailed=${checkpoint.detailed} resumes=${checkpoint.resumes}`
    );
    return {
      status: "success",
      dryRun,
      kind: "ats_applications",
      mode: opts.mode,
      datasetCounts: countsFrom(checkpoint),
      checkpoint,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.replace(PII_LOG_PATTERN, "[redacted]") : "ATS sync failed";
    log(`ATS applications sync failed: ${message}`);
    const checkpointSafe = checkpoint;
    await persist("failed", message);
    return failed(checkpointSafe, message);
  }
}

export function formatAtsSyncSummary(result: BambooAtsSyncResult): string {
  if (result.kind === ATS_RESUMES_ONLY_KIND) {
    return [
      `ATS resumes-only ${result.status}`,
      `mode=${result.mode}`,
      `selected=${result.datasetCounts.applications}`,
      `resumes=${result.datasetCounts.resumes}`,
      `skipped=${result.checkpoint.skippedExistingResume ?? 0}`,
      `pending=${result.checkpoint.pendingResumes ?? 0}`,
      `phase=${result.checkpoint.phase}`,
    ].join(" ");
  }
  return [
    `ATS applications ${result.status}`,
    `mode=${result.mode}`,
    `applications=${result.datasetCounts.applications}`,
    `answers=${result.datasetCounts.answers}`,
    `comments=${result.datasetCounts.comments}`,
    `history=${result.datasetCounts.statusHistory}`,
    `resumes=${result.datasetCounts.resumes}`,
    `phase=${result.checkpoint.phase}`,
  ].join(" ");
}

export { parseBoundedConcurrency };
