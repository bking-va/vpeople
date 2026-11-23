import { BambooHrClient, BambooHrHttpError } from "./client";
import { BAMBOO_BLOB_UNAVAILABLE, type PrivateBlobStore } from "./blob";
import {
  bambooFileBlobPath,
  filesFromViewPayload,
  type MappedBambooFile,
} from "./map-files";
import type { BambooSyncStore } from "./sync";
import type { BambooSyncMode } from "./types";

const PII_LOG_PATTERN =
  /(\b\d{3}-\d{2}-\d{4}\b)|(\$\s?\d)|(@[a-z0-9.-]+\.[a-z]{2,})/i;

export type FilesCheckpoint = {
  phase: "employee" | "company" | "done";
  lastEmployeeBambooId: string | null;
  lastEmployeeFileId: string | null;
  lastCompanyFileId: string | null;
  employeeFiles: number;
  companyFiles: number;
  restricted: number;
  blobs: number;
};

export type BambooFilesSyncResult = {
  status: "success" | "skipped" | "failed" | "checkpointed";
  dryRun: boolean;
  kind: "bamboo_files";
  mode: BambooSyncMode;
  checkpoint: FilesCheckpoint;
  errorMessage?: string;
};

export type RunBambooFilesSyncOptions = {
  client: BambooHrClient | null;
  store: BambooSyncStore;
  blob?: PrivateBlobStore | null;
  mode: BambooSyncMode;
  dryRun?: boolean;
  importBlobs?: boolean;
  log?: (message: string) => void;
  now?: Date;
  maxMs?: number;
  maxFiles?: number;
};

function emptyCheckpoint(): FilesCheckpoint {
  return {
    phase: "employee",
    lastEmployeeBambooId: null,
    lastEmployeeFileId: null,
    lastCompanyFileId: null,
    employeeFiles: 0,
    companyFiles: 0,
    restricted: 0,
    blobs: 0,
  };
}

function asCheckpoint(value: Record<string, unknown> | null | undefined): FilesCheckpoint {
  if (!value) return emptyCheckpoint();
  const phase = value.phase;
  return {
    phase: phase === "company" || phase === "done" || phase === "employee" ? phase : "employee",
    lastEmployeeBambooId:
      typeof value.lastEmployeeBambooId === "string" ? value.lastEmployeeBambooId : null,
    lastEmployeeFileId:
      typeof value.lastEmployeeFileId === "string" ? value.lastEmployeeFileId : null,
    lastCompanyFileId:
      typeof value.lastCompanyFileId === "string" ? value.lastCompanyFileId : null,
    employeeFiles: Number(value.employeeFiles) || 0,
    companyFiles: Number(value.companyFiles) || 0,
    restricted: Number(value.restricted) || 0,
    blobs: Number(value.blobs) || 0,
  };
}

function safeLog(log: (message: string) => void, message: string) {
  if (PII_LOG_PATTERN.test(message)) {
    log("sync log redacted");
    return;
  }
  log(message);
}

function isTruncatedDownloadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  if (
    error instanceof TypeError &&
    (error.message === "terminated" || error.message === "fetch failed")
  ) {
    return true;
  }
  const cause = error.cause;
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "UND_ERR_SOCKET"
  ) {
    return true;
  }
  return false;
}

async function putFile(
  blob: PrivateBlobStore | null,
  kind: "employee" | "company",
  mapped: MappedBambooFile,
  file: { body: Buffer; contentType: string | null; filename: string | null }
): Promise<string | null> {
  if (!blob) return null;
  const stored = await blob.putPrivate({
    pathname: bambooFileBlobPath(kind, mapped.bambooId, file.filename || mapped.title),
    body: file.body,
    contentType: file.contentType,
  });
  return stored.url;
}

export async function runBambooFilesSync(
  opts: RunBambooFilesSyncOptions
): Promise<BambooFilesSyncResult> {
  const log = (message: string) => {
    if (opts.log) safeLog(opts.log, message);
  };
  const dryRun = Boolean(opts.dryRun);
  const startedAt = (opts.now ?? new Date()).toISOString();
  const deadline = opts.maxMs != null ? Date.now() + opts.maxMs : null;
  const timedOut = () => deadline != null && Date.now() >= deadline;
  const importBlobs = opts.importBlobs !== false;
  const blob = importBlobs ? opts.blob ?? null : null;
  let processed = 0;
  let debugStep = "init";

  if (!opts.client) {
    log("BAMBOOHR_API_KEY is unset; Bamboo files sync skipped");
    return {
      status: "skipped",
      dryRun,
      kind: "bamboo_files",
      mode: opts.mode,
      checkpoint: emptyCheckpoint(),
    };
  }

  const incomplete = dryRun
    ? null
    : await opts.store.lastIncompleteKindCheckpoint("bamboo_files");
  let checkpoint = asCheckpoint(incomplete?.checkpoint);
  let runId = incomplete?.id ?? null;
  if (!dryRun && runId == null) {
    runId = await opts.store.startSyncRun({
      kind: "bamboo_files",
      mode: opts.mode,
      status: "running",
      startedAt,
      checkpoint,
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
      datasetCounts: {
        employeeFiles: checkpoint.employeeFiles,
        companyFiles: checkpoint.companyFiles,
        restricted: checkpoint.restricted,
        blobs: checkpoint.blobs,
      },
      errorMessage,
    });
  };

  try {
    if (!blob && importBlobs) {
      log("BLOB_READ_WRITE_TOKEN unset; storing file metadata only");
    }
    const importedEmployee = await opts.store.listImportedFileBambooIds("employee");
    const importedCompany = await opts.store.listImportedFileBambooIds("company");

    if (checkpoint.phase === "employee") {
      const employees = (await opts.store.listEmployees())
        .filter((row) => row.bambooId)
        .sort((a, b) => String(a.bambooId).localeCompare(String(b.bambooId)));
      log(`Phase employee files employees=${employees.length}`);
      for (const employee of employees) {
        const bambooId = employee.bambooId!;
        if (
          checkpoint.lastEmployeeBambooId &&
          bambooId < checkpoint.lastEmployeeBambooId
        ) {
          continue;
        }
        if (timedOut() || (opts.maxFiles != null && processed >= opts.maxFiles)) {
          await persist("checkpointed");
          return {
            status: "checkpointed",
            dryRun,
            kind: "bamboo_files",
            mode: opts.mode,
            checkpoint,
          };
        }
        debugStep = `view employee=${bambooId}`;
        let view: unknown;
        try {
          view = await opts.client.fetchEmployeeFilesView(bambooId);
        } catch (error) {
          if (error instanceof BambooHrHttpError && (error.status === 404 || error.status === 403)) {
            checkpoint.lastEmployeeBambooId = bambooId;
            continue;
          }
          throw error;
        }
        const files = filesFromViewPayload(view, "employee", bambooId);
        for (const mapped of files) {
          const skipBlob = importedEmployee.has(mapped.bambooId);
          let fileUrl: string | null = null;
          if (!skipBlob && !dryRun && blob) {
            try {
              debugStep = `download employee=${bambooId} fileId=${mapped.fileId}`;
              const file = await opts.client.fetchEmployeeFile(bambooId, mapped.fileId);
              debugStep = `blobput employee=${bambooId} fileId=${mapped.fileId} bytes=${file.body.length}`;
              fileUrl = await putFile(blob, "employee", mapped, file);
              if (fileUrl) checkpoint.blobs += 1;
            } catch (error) {
              if (error instanceof BambooHrHttpError && error.status === 404) {
                log(`employee file missing bambooFileId=${mapped.fileId}`);
                fileUrl = BAMBOO_BLOB_UNAVAILABLE;
              } else if (error instanceof BambooHrHttpError && error.status >= 500) {
                log(`file download failed status=${error.status} bambooFileId=${mapped.fileId}`);
                fileUrl = BAMBOO_BLOB_UNAVAILABLE;
              } else if (debugStep.startsWith("download") && isTruncatedDownloadError(error)) {
                log(`file download truncated after retries bambooFileId=${mapped.fileId}`);
                fileUrl = BAMBOO_BLOB_UNAVAILABLE;
              } else {
                throw error;
              }
            }
          }
          if (!dryRun) {
            debugStep = `dbupsert employee=${bambooId} fileId=${mapped.fileId}`;
            await opts.store.upsertEmployeeDocumentsBatch([
              {
                bambooId: mapped.bambooId,
                employeeId: employee.id,
                title: mapped.title,
                category: mapped.category,
                bambooCategory: mapped.bambooCategory,
                restricted: mapped.restricted,
                containsCompensation: mapped.containsCompensation,
                fileUrl,
                uploadedBy: employee.id,
              },
            ]);
          }
          if (!skipBlob) {
            checkpoint.employeeFiles += 1;
            if (mapped.restricted) checkpoint.restricted += 1;
            importedEmployee.add(mapped.bambooId);
            processed += 1;
            if (processed % 25 === 0) {
              log(`employee files written=${checkpoint.employeeFiles}`);
              await persist("running");
            }
          }
          checkpoint.lastEmployeeBambooId = bambooId;
          checkpoint.lastEmployeeFileId = mapped.fileId;
          if (opts.maxFiles != null && processed >= opts.maxFiles) break;
        }
        checkpoint.lastEmployeeBambooId = bambooId;
        if (opts.maxFiles != null && processed >= opts.maxFiles) break;
      }
      if (opts.maxFiles != null && processed >= opts.maxFiles) {
        await persist("checkpointed");
        return {
          status: "checkpointed",
          dryRun,
          kind: "bamboo_files",
          mode: opts.mode,
          checkpoint,
        };
      }
      checkpoint.phase = "company";
      await persist("running");
    }

    if (checkpoint.phase === "company") {
      log("Phase company files");
      debugStep = "view company";
      const view = await opts.client.fetchCompanyFilesView();
      const files = filesFromViewPayload(view, "company");
      for (const mapped of files) {
        if (timedOut() || (opts.maxFiles != null && processed >= opts.maxFiles)) {
          await persist("checkpointed");
          return {
            status: "checkpointed",
            dryRun,
            kind: "bamboo_files",
            mode: opts.mode,
            checkpoint,
          };
        }
        const skipBlob = importedCompany.has(mapped.bambooId);
        let fileUrl: string | null = null;
        if (!skipBlob && !dryRun && blob) {
          try {
            debugStep = `download company fileId=${mapped.fileId}`;
            const file = await opts.client.fetchFile(mapped.fileId);
            debugStep = `blobput company fileId=${mapped.fileId} bytes=${file.body.length}`;
            fileUrl = await putFile(blob, "company", mapped, file);
            if (fileUrl) checkpoint.blobs += 1;
          } catch (error) {
            if (error instanceof BambooHrHttpError && error.status === 404) {
              log(`company file missing bambooFileId=${mapped.fileId}`);
              fileUrl = BAMBOO_BLOB_UNAVAILABLE;
            } else if (error instanceof BambooHrHttpError && error.status >= 500) {
              log(`file download failed status=${error.status} bambooFileId=${mapped.fileId}`);
              fileUrl = BAMBOO_BLOB_UNAVAILABLE;
            } else if (debugStep.startsWith("download") && isTruncatedDownloadError(error)) {
              log(`file download truncated after retries bambooFileId=${mapped.fileId}`);
              fileUrl = BAMBOO_BLOB_UNAVAILABLE;
            } else {
              throw error;
            }
          }
        }
        if (!dryRun) {
          await opts.store.upsertCompanyFilesBatch([
            {
              bambooId: mapped.bambooId,
              title: mapped.title,
              category: mapped.category,
              bambooCategory: mapped.bambooCategory,
              restricted: mapped.restricted,
              containsCompensation: mapped.containsCompensation,
              fileUrl,
              sizeBytes: null,
            },
          ]);
        }
        if (!skipBlob) {
          checkpoint.companyFiles += 1;
          if (mapped.restricted) checkpoint.restricted += 1;
          importedCompany.add(mapped.bambooId);
          processed += 1;
          if (processed % 25 === 0) {
            log(`company files written=${checkpoint.companyFiles}`);
            await persist("running");
          }
        }
        checkpoint.lastCompanyFileId = mapped.fileId;
      }
      checkpoint.phase = "done";
    }

    await persist("success");
    log(
      `Bamboo files employee=${checkpoint.employeeFiles} company=${checkpoint.companyFiles} blobs=${checkpoint.blobs}`
    );
    return {
      status: "success",
      dryRun,
      kind: "bamboo_files",
      mode: opts.mode,
      checkpoint,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.replace(PII_LOG_PATTERN, "[redacted]")
        : "Bamboo files sync failed";
    const cause =
      error instanceof Error && typeof error.cause === "object" && error.cause
        ? (error.cause as { name?: unknown; code?: unknown })
        : {};
    log(
      `Bamboo files sync failed: ${message} name=${error instanceof Error ? error.name : typeof error} cause=${cause.name}/${cause.code} step=${debugStep}`
    );
    await persist("failed", message);
    return {
      status: "failed",
      dryRun,
      kind: "bamboo_files",
      mode: opts.mode,
      checkpoint,
      errorMessage: message,
    };
  }
}

export function formatFilesSyncSummary(result: BambooFilesSyncResult): string {
  return [
    `Bamboo files ${result.status}`,
    `employee=${result.checkpoint.employeeFiles}`,
    `company=${result.checkpoint.companyFiles}`,
    `restricted=${result.checkpoint.restricted}`,
    `blobs=${result.checkpoint.blobs}`,
    `phase=${result.checkpoint.phase}`,
  ].join(" ");
}
