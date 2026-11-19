import {
  BAMBOO_SYNC_CACHE_VERSION,
  assertSafeCacheLocation,
  bambooSyncCacheExists,
  readBambooSyncCache,
  writeBambooSyncCache,
  type BambooSyncSnapshot,
} from "./cache";
import {
  BAMBOO_WRITE_CHUNK_SIZE,
  type BatchProgress,
} from "./chunks";
import {
  BambooHrClient,
  BambooHrHttpError,
  BAMBOO_PROGRESS_EVERY,
} from "./client";
import {
  emptyExtendedPayload,
  fetchExtendedPayload,
  mapExtendedPayload,
  writeExtendedPayload,
  type ExtendedFetchPayload,
} from "./extended";
import { emptyDatasetCounts } from "./map-extended";
import {
  blankToNull,
  isBrendanWorkEmail,
  mapEmergencyContact,
  mapEmployeeRecord,
  mapEmploymentStatus,
  parsePayRate,
} from "./map";
import type {
  AccessLevel,
  BambooEmployeeRecord,
  BambooSyncMode,
  BambooSyncResult,
  BrendanSnapshot,
  MappedEmployee,
  MappedEmployeeBundle,
  SyncEmployeeRow,
} from "./types";

export type BambooSyncLogger = (message: string) => void;

export type EmployeeBatchInput = {
  bambooId: string;
  employee: MappedEmployee;
  departmentId: number | null;
  divisionId: number | null;
  locationId: number | null;
};

export type HistoryReplacement = {
  employeeId: number;
  rows: Array<Record<string, unknown>>;
};

export interface BambooSyncStore {
  listEmployees(): Promise<SyncEmployeeRow[]>;
  replaceDemoEmployees(): Promise<{
    removed: number;
    brendanSnapshot: BrendanSnapshot | null;
  }>;
  upsertOrgUnit(
    kind: "department" | "division" | "location" | "jobTitle",
    name: string
  ): Promise<number | null>;
  upsertOrgUnits(
    kind: "department" | "division" | "location" | "jobTitle",
    names: string[]
  ): Promise<Map<string, number>>;
  upsertEmployee(
    bambooId: string,
    employee: MappedEmployee
  ): Promise<{ id: number; created: boolean }>;
  upsertEmployeesBatch(
    rows: EmployeeBatchInput[],
    progress?: BatchProgress
  ): Promise<{
    idByBambooId: Map<string, number>;
    created: number;
    updated: number;
  }>;
  setManager(employeeId: number, managerId: number | null): Promise<void>;
  setManagersBatch(
    links: Array<{ employeeId: number; managerId: number | null }>,
    progress?: BatchProgress
  ): Promise<void>;
  setUnresolvedSupervisor(
    employeeId: number,
    supervisorBambooId: string | null
  ): Promise<void>;
  setUnresolvedSupervisorsBatch(
    links: Array<{ employeeId: number; supervisorBambooId: string | null }>,
    progress?: BatchProgress
  ): Promise<void>;
  listUnresolvedSupervisors(): Promise<
    Array<{ employeeId: number; supervisorBambooId: string }>
  >;
  markTerminated(bambooId: string): Promise<void>;
  markTerminatedBatch(
    bambooIds: string[],
    progress?: BatchProgress
  ): Promise<void>;
  replaceJobHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void>;
  replaceJobHistoryMany(
    replacements: HistoryReplacement[],
    progress?: BatchProgress
  ): Promise<void>;
  replaceEmploymentStatusHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void>;
  replaceEmploymentStatusHistoryMany(
    replacements: HistoryReplacement[],
    progress?: BatchProgress
  ): Promise<void>;
  replaceCompensationHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void>;
  replaceCompensationHistoryMany(
    replacements: HistoryReplacement[],
    progress?: BatchProgress
  ): Promise<void>;
  replaceEmergencyContacts(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void>;
  replaceEmergencyContactsMany(
    replacements: HistoryReplacement[],
    progress?: BatchProgress
  ): Promise<void>;
  upsertTimeOffPolicy(name: string, policyType: string): Promise<number>;
  upsertTimeOffPoliciesBatch(
    policies: Array<{ name: string; policyType: string; bambooId?: string | null }>
  ): Promise<Map<string, number>>;
  upsertTimeOffBalance(
    employeeId: number,
    policyId: number,
    balance: string
  ): Promise<void>;
  upsertTimeOffBalancesBatch(
    rows: Array<{ employeeId: number; policyId: number; sourceBalance: string }>,
    progress?: BatchProgress
  ): Promise<void>;
  upsertTimeOffRequestsBatch(
    rows: Array<{
      bambooId: string;
      employeeId: number;
      policyId: number;
      startDate: string;
      endDate: string;
      daysRequested: string;
      status: "pending" | "approved" | "denied" | "cancelled";
      notes: string | null;
      reviewNotes: string | null;
      reviewedAt: string | null;
      createdAt: string | null;
    }>,
    progress?: BatchProgress
  ): Promise<number>;
  upsertJobOpeningsBatch(
    rows: Array<{
      bambooId: string;
      title: string;
      departmentId: number | null;
      locationId: number | null;
      hiringLeadId: number | null;
      status: "draft" | "open" | "on_hold" | "filled" | "canceled";
      bambooStatusId: string | null;
      bambooStatusLabel: string | null;
      employmentType: string;
      description: string | null;
      requirements: string | null;
      openDate: string | null;
      closeDate: string | null;
    }>,
    progress?: BatchProgress
  ): Promise<number>;
  upsertEducationBatch(
    rows: Array<{
      bambooId: string;
      employeeId: number;
      institution: string;
      degree: string | null;
      fieldOfStudy: string | null;
      startDate: string | null;
      endDate: string | null;
      notes: string | null;
    }>,
    progress?: BatchProgress
  ): Promise<number>;
  upsertVisasBatch(
    rows: Array<{
      bambooId: string;
      employeeId: number;
      visaType: string;
      country: string;
      documentNumber: string | null;
      issuedDate: string | null;
      expiryDate: string | null;
      status: string;
    }>,
    progress?: BatchProgress
  ): Promise<number>;
  pruneImportedRowsNotIn(
    kind: "time_off_requests" | "job_openings" | "education" | "visas" | "candidates",
    keepBambooIds: string[],
    progress?: BatchProgress
  ): Promise<number>;
  applyBrendanCarryOver(opts: BrendanSnapshot): Promise<boolean>;
  recordSyncRun(run: Record<string, unknown>): Promise<void>;
  lastSuccessfulIncrementalCursor(): Promise<string | null>;
  listJobOpeningIdsByBambooId(): Promise<Map<string, number>>;
  upsertCandidatesBatch(
    rows: Array<{
      bambooId: string;
      jobOpeningId: number;
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
      linkedinUrl: string | null;
      source: "linkedin" | "indeed" | "glassdoor" | "referral" | "direct" | "other";
      sourceDetail: string | null;
      stage: "new" | "phone_screen" | "interview" | "offer" | "hired" | "rejected";
      bambooStatusId: string | null;
      bambooStatusLabel: string | null;
      rating: number | null;
      appliedAt: string | null;
      coverLetter: string | null;
      resumeBambooFileId: string | null;
      resumeBlobUrl: string | null;
      atsDetailImportedAt: string | null;
    }>,
    progress?: BatchProgress
  ): Promise<Map<string, number>>;
  upsertCandidateAnswersBatch(
    rows: Array<{
      candidateId: number;
      bambooQuestionId: string;
      question: string;
      answer: string | null;
    }>,
    progress?: BatchProgress
  ): Promise<number>;
  upsertCandidateCommentsBatch(
    rows: Array<{
      candidateId: number;
      bambooId: string;
      authorName: string | null;
      authorBambooId: string | null;
      content: string;
      commentedAt: string | null;
    }>,
    progress?: BatchProgress
  ): Promise<number>;
  upsertCandidateStatusHistoryBatch(
    rows: Array<{
      candidateId: number;
      bambooEventId: string;
      bambooStatusId: string | null;
      statusLabel: string;
      changedAt: string | null;
      changedByName: string | null;
    }>,
    progress?: BatchProgress
  ): Promise<number>;
  listCandidatesNeedingDetail(
    limit: number,
    afterBambooId?: string | null
  ): Promise<Array<{ id: number; bambooId: string }>>;
  listCandidatesNeedingResume(
    limit: number,
    afterBambooId?: string | null
  ): Promise<Array<{ id: number; bambooId: string; resumeBambooFileId: string }>>;
  setCandidateResumeBlob(bambooId: string, blobUrl: string): Promise<void>;
  markCandidateDetailImported(bambooIds: string[]): Promise<void>;
  startSyncRun(run: Record<string, unknown>): Promise<number>;
  updateSyncRun(id: number, run: Record<string, unknown>): Promise<void>;
  lastIncompleteAtsCheckpoint(): Promise<{
    id: number;
    checkpoint: Record<string, unknown> | null;
    latestChanged: string | null;
  } | null>;
  lastSuccessfulAtsCursor(): Promise<string | null>;
  transaction?<T>(fn: (store: BambooSyncStore) => Promise<T>): Promise<T>;
}

export type RunBambooSyncOptions = {
  client: BambooHrClient | null;
  store: BambooSyncStore;
  mode: BambooSyncMode;
  dryRun?: boolean;
  replaceDemo?: boolean;
  log?: BambooSyncLogger;
  now?: Date;
  cachePath?: string | null;
  concurrency?: number;
  progressEvery?: number;
  writeChunkSize?: number;
};

const PII_LOG_PATTERN =
  /(\b\d{3}-\d{2}-\d{4}\b)|(\$\s?\d)|(@[a-z0-9.-]+\.[a-z]{2,})/i;

function safeLog(log: BambooSyncLogger, message: string): void {
  if (PII_LOG_PATTERN.test(message)) {
    log("sync log redacted");
    return;
  }
  log(message);
}

function safeErrorMessage(message: string): string {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted]")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
    .slice(0, 500);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function tableRowDate(row: Record<string, unknown>): string | null {
  return (
    blankToNull(row.date) ||
    blankToNull(row.startDate) ||
    blankToNull(row.effectiveDate)
  );
}

async function inStoreTransaction<T>(
  store: BambooSyncStore,
  fn: (tx: BambooSyncStore) => Promise<T>
): Promise<T> {
  if (store.transaction) return store.transaction(fn);
  return fn(store);
}

type TableRows = Record<string, Array<Record<string, unknown>>>;

type SyncFetchPayload = {
  employees: BambooEmployeeRecord[];
  latestChanged: string | null;
  deletedBambooIds: string[];
  jobInfo: TableRows;
  statusInfo: TableRows;
  compensation: TableRows;
  contacts: TableRows | null;
  timeOffTypes: Array<{ id: string; name: string; units?: string }>;
  balancesByBambooId: Map<string, Array<{ name: string; balance: string }>>;
  extended: ExtendedFetchPayload;
};

function tableKeyCount(table: TableRows | null): number {
  return table ? Object.keys(table).length : 0;
}

function snapshotToPayload(snapshot: BambooSyncSnapshot): SyncFetchPayload {
  return {
    employees: snapshot.employees,
    latestChanged: snapshot.latestChanged,
    deletedBambooIds: snapshot.deletedBambooIds,
    jobInfo: snapshot.tables.jobInfo,
    statusInfo: snapshot.tables.employmentStatus,
    compensation: snapshot.tables.compensation,
    contacts: snapshot.tables.emergencyContacts,
    timeOffTypes: snapshot.timeOffTypes,
    balancesByBambooId: new Map(Object.entries(snapshot.balances)),
    extended: snapshot.extended ?? emptyExtendedPayload(),
  };
}

function payloadToSnapshot(
  mode: BambooSyncMode,
  payload: SyncFetchPayload
): BambooSyncSnapshot {
  return {
    version: BAMBOO_SYNC_CACHE_VERSION,
    mode,
    fetchedAt: new Date().toISOString(),
    employees: payload.employees,
    latestChanged: payload.latestChanged,
    deletedBambooIds: payload.deletedBambooIds,
    tables: {
      jobInfo: payload.jobInfo,
      employmentStatus: payload.statusInfo,
      compensation: payload.compensation,
      emergencyContacts: payload.contacts,
    },
    timeOffTypes: payload.timeOffTypes,
    balances: Object.fromEntries(payload.balancesByBambooId),
    extended: payload.extended,
  };
}

async function fetchOptionalTable(
  client: BambooHrClient,
  table: string,
  since: string
): Promise<TableRows | null> {
  try {
    return await client.fetchTableRows(table, since);
  } catch (error) {
    if (error instanceof BambooHrHttpError && error.status === 404) return null;
    throw error;
  }
}

function tableRowsForEmployee(
  table: TableRows | null,
  bambooId: string,
  mode: BambooSyncMode
): { replace: boolean; rows: Array<Record<string, unknown>> } {
  if (table == null) return { replace: false, rows: [] };
  if (mode === "incremental" && !Object.prototype.hasOwnProperty.call(table, bambooId)) {
    return { replace: false, rows: [] };
  }
  return { replace: true, rows: table[bambooId] || [] };
}

async function loadEmployees(
  client: BambooHrClient,
  store: BambooSyncStore,
  mode: BambooSyncMode
): Promise<{
  employees: BambooEmployeeRecord[];
  latestChanged: string | null;
  deletedBambooIds: string[];
}> {
  if (mode === "full") {
    const employees = await client.fetchAllEmployees();
    const latestChanged =
      employees
        .map((row) => blankToNull(row.lastChanged))
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? new Date().toISOString();
    return { employees, latestChanged, deletedBambooIds: [] };
  }

  const since =
    (await store.lastSuccessfulIncrementalCursor()) || "2010-01-01T00:00:00Z";
  const changed = await client.fetchChangedEmployees(since);
  const deletedBambooIds = changed.employees
    .filter((row) => row.action.toLowerCase() === "deleted")
    .map((row) => row.id)
    .filter(Boolean);
  const upsertIds = changed.employees
    .filter((row) => row.action.toLowerCase() !== "deleted")
    .map((row) => row.id)
    .filter(Boolean);
  const employees = await client.fetchEmployeesByIds(upsertIds);
  return {
    employees,
    latestChanged: changed.latest,
    deletedBambooIds,
  };
}

async function fetchHttpPayload(
  client: BambooHrClient,
  store: BambooSyncStore,
  mode: BambooSyncMode,
  existingBambooIds: string[],
  log: BambooSyncLogger,
  now: Date,
  concurrency: number,
  progressEvery: number
): Promise<SyncFetchPayload> {
  log("Phase fetch: employees");
  const { employees, latestChanged, deletedBambooIds } = await loadEmployees(
    client,
    store,
    mode
  );

  const tablesSince =
    mode === "incremental"
      ? (await store.lastSuccessfulIncrementalCursor()) || "2010-01-01T00:00:00Z"
      : "2010-01-01T00:00:00Z";
  log("Phase fetch: tables");
  const jobInfo = await client.fetchTableRows("jobInfo", tablesSince);
  const statusInfo = await client.fetchTableRows("employmentStatus", tablesSince);
  const compensation = await client.fetchTableRows("compensation", tablesSince);
  const contacts = await fetchOptionalTable(
    client,
    "emergencyContacts",
    tablesSince
  );
  log(
    `tables fetched jobInfo=${tableKeyCount(jobInfo)} employmentStatus=${tableKeyCount(statusInfo)} compensation=${tableKeyCount(compensation)} emergencyContacts=${tableKeyCount(contacts)}`
  );

  log("Phase fetch: time-off types");
  const timeOffTypes = await client.fetchTimeOffTypes().catch(() => []);
  const unitsByName = new Map<string, string>();
  for (const type of timeOffTypes) {
    if (!type.units) continue;
    unitsByName.set(type.name, type.units);
    unitsByName.set(type.name.toLowerCase(), type.units);
  }

  const asOf = now.toISOString().slice(0, 10);
  const balanceTargets = uniqueSorted([
    ...employees.map((row) => String(row.id ?? "")).filter(Boolean),
    ...existingBambooIds,
  ]);
  log(`Phase fetch: time-off balances (${balanceTargets.length})`);
  const { balances, failed } = await client.fetchTimeOffBalancesMany(
    balanceTargets,
    asOf,
    unitsByName,
    {
      concurrency,
      onProgress: (done, total) => {
        if (done === total || done % progressEvery === 0) {
          log(`time-off balances ${done}/${total}`);
        }
      },
    }
  );
  if (failed > 0) {
    log(`time-off balances failed: ${failed}`);
  }

  const extended = await fetchExtendedPayload(client, mode, now, log);
  log("Phase fetch complete");

  return {
    employees,
    latestChanged,
    deletedBambooIds,
    jobInfo,
    statusInfo,
    compensation,
    contacts,
    timeOffTypes,
    balancesByBambooId: balances,
    extended,
  };
}

export async function runBambooSync(
  opts: RunBambooSyncOptions
): Promise<BambooSyncResult> {
  const log: BambooSyncLogger = (message) => {
    if (opts.log) safeLog(opts.log, message);
  };
  const dryRun = Boolean(opts.dryRun);
  const startedAt = (opts.now ?? new Date()).toISOString();

  if (!opts.client) {
    log("BAMBOOHR_API_KEY is unset; bamboo sync skipped");
    if (!dryRun) {
      await opts.store.recordSyncRun({
        mode: opts.mode,
        status: "skipped",
        startedAt,
        finishedAt: new Date().toISOString(),
        employeesFetched: 0,
        employeesCreated: 0,
        employeesUpdated: 0,
        latestChanged: null,
      });
    }
    return {
      status: "skipped",
      dryRun,
      fetched: 0,
      created: 0,
      updated: 0,
      reportsToResolved: 0,
      demoRemoved: 0,
      brendanAdminBound: false,
      unmappedFields: [],
      bambooIds: [],
      writes: dryRun ? 0 : 1,
      latestChanged: null,
      datasetCounts: emptyDatasetCounts(),
    };
  }

  let mapped: MappedEmployeeBundle[] = [];
  let bambooIds: string[] = [];
  let unmappedFields: string[] = [];

  try {
  const existing = await opts.store.listEmployees();
  const existingByBambooId = new Map(
    existing
      .filter((row) => row.bambooId)
      .map((row) => [row.bambooId as string, row])
  );
  const demoExisting = existing.filter((row) => !row.bambooId);
  const brendanSnapshotFromExisting = existing.find(
    (row) => row.employeeNumber === "E001" || isBrendanWorkEmail(row.email)
  );
  const snapshot: BrendanSnapshot | null = brendanSnapshotFromExisting
    ? {
        accessLevel:
          brendanSnapshotFromExisting.accessLevel === "full_admin"
            ? "full_admin"
            : "full_admin",
        vendastaSub: brendanSnapshotFromExisting.vendastaSub,
        userId: brendanSnapshotFromExisting.userId,
      }
    : { accessLevel: "full_admin", vendastaSub: null, userId: null };

  let payload: SyncFetchPayload;
  if (dryRun) {
    log("Phase fetch: employees");
    payload = {
      ...(await loadEmployees(opts.client, opts.store, opts.mode)),
      jobInfo: {},
      statusInfo: {},
      compensation: {},
      contacts: null,
      timeOffTypes: [],
      balancesByBambooId: new Map(),
      extended: emptyExtendedPayload(),
    };
  } else if (opts.cachePath) {
    await assertSafeCacheLocation(opts.cachePath);
    if (await bambooSyncCacheExists(opts.cachePath)) {
      const cached = await readBambooSyncCache(opts.cachePath);
      if (cached.mode !== opts.mode) {
        throw new Error("Bamboo sync cache mode does not match this run");
      }
      log("Phase fetch: loaded cache");
      payload = snapshotToPayload(cached);
    } else {
      payload = await fetchHttpPayload(
        opts.client,
        opts.store,
        opts.mode,
        [...existingByBambooId.keys()],
        log,
        opts.now ?? new Date(),
        opts.concurrency ?? opts.client.concurrency,
        opts.progressEvery ?? BAMBOO_PROGRESS_EVERY
      );
      try {
        await writeBambooSyncCache(
          opts.cachePath,
          payloadToSnapshot(opts.mode, payload)
        );
        log("Phase fetch: wrote cache");
      } catch {
        log("Phase fetch: cache write failed");
      }
    }
  } else {
    payload = await fetchHttpPayload(
      opts.client,
      opts.store,
      opts.mode,
      [...existingByBambooId.keys()],
      log,
      opts.now ?? new Date(),
      opts.concurrency ?? opts.client.concurrency,
      opts.progressEvery ?? BAMBOO_PROGRESS_EVERY
    );
  }

  if (dryRun) {
    payload.extended = await fetchExtendedPayload(
      opts.client,
      opts.mode,
      opts.now ?? new Date(),
      log
    );
  }

  mapped = payload.employees
    .map((row) => mapEmployeeRecord(row))
    .filter((row) => row.bambooId);
  bambooIds = uniqueSorted(mapped.map((row) => row.bambooId));
  unmappedFields = uniqueSorted(mapped.flatMap((row) => row.unmappedFields));
  const wouldCreate = mapped.filter((row) => !existingByBambooId.has(row.bambooId)).length;
  const wouldUpdate = mapped.length - wouldCreate;
  const { latestChanged, deletedBambooIds, jobInfo, statusInfo, compensation, contacts, timeOffTypes, balancesByBambooId, extended } =
    payload;
  const mappedExtended = mapExtendedPayload(extended);

  log(`Fetched ${mapped.length} employees`);
  log(`Bamboo ids: ${bambooIds.join(", ")}`);
  log(`Would create ${wouldCreate}, update ${wouldUpdate}`);
  if (unmappedFields.length > 0) {
    log(`Unmapped fields: ${unmappedFields.join(", ")}`);
  }
  if (opts.replaceDemo) {
    log(`Demo employees that would be removed: ${demoExisting.length}`);
  }
  log(
    `Would import timeOffRequests=${mappedExtended.timeOffRequests.length} jobOpenings=${mappedExtended.jobOpenings.length} education=${mappedExtended.education.length} visas=${mappedExtended.visas.length}`
  );

  if (dryRun) {
    return {
      status: "success",
      dryRun: true,
      fetched: mapped.length,
      created: wouldCreate,
      updated: wouldUpdate,
      reportsToResolved: mapped.filter((row) => row.supervisorBambooId).length,
      demoRemoved: opts.replaceDemo ? demoExisting.length : 0,
      brendanAdminBound: mapped.some((row) =>
        isBrendanWorkEmail(row.employee.email)
      ),
      unmappedFields,
      bambooIds,
      writes: 0,
      latestChanged,
      datasetCounts: {
        timeOffRequests: mappedExtended.timeOffRequests.length,
        jobOpenings: mappedExtended.jobOpenings.length,
        education: mappedExtended.education.length,
        visas: mappedExtended.visas.length,
      },
    };
  }

  log("Phase write: starting database transaction");
  const writeChunkSize = opts.writeChunkSize ?? BAMBOO_WRITE_CHUNK_SIZE;
  const writeProgress = (label: string): BatchProgress => ({
    chunkSize: writeChunkSize,
    onProgress: (done, total) => {
      if (total === 0) return;
      log(`${label} ${done}/${total}`);
    },
  });
  return await inStoreTransaction(opts.store, async (store) => {
    let demoRemoved = 0;
    let appliedSnapshot = snapshot;
    if (opts.replaceDemo) {
      log("Phase write: demo removal");
      const replaced = await store.replaceDemoEmployees();
      demoRemoved = replaced.removed;
      if (replaced.brendanSnapshot) {
        appliedSnapshot = {
          accessLevel: "full_admin",
          vendastaSub: replaced.brendanSnapshot.vendastaSub,
          userId: replaced.brendanSnapshot.userId,
        };
      }
    }

    const idByBambooId = new Map<string, number>(
      [...existingByBambooId.entries()].map(([bambooId, row]) => [bambooId, row.id])
    );

    log("Phase write: org units");
    const departmentNames = mapped
      .map((row) => row.employee.departmentName)
      .concat(
        Object.values(jobInfo).flatMap((rows) =>
          rows.map((row) => blankToNull(row.department))
        )
      );
    const divisionNames = mapped
      .map((row) => row.employee.divisionName)
      .concat(
        Object.values(jobInfo).flatMap((rows) =>
          rows.map((row) => blankToNull(row.division))
        )
      );
    const locationNames = mapped
      .map((row) => row.employee.locationName)
      .concat(
        Object.values(jobInfo).flatMap((rows) =>
          rows.map((row) => blankToNull(row.location))
        )
      );
    const jobTitleNames = mapped.map((row) => row.employee.jobTitle);
    const [departmentsMap, divisionsMap, locationsMap] = await Promise.all([
      store.upsertOrgUnits("department", departmentNames.filter((name): name is string => Boolean(name))),
      store.upsertOrgUnits("division", divisionNames.filter((name): name is string => Boolean(name))),
      store.upsertOrgUnits("location", locationNames.filter((name): name is string => Boolean(name))),
      store.upsertOrgUnits(
        "jobTitle",
        jobTitleNames.filter((name): name is string => Boolean(name))
      ),
    ]);
    const orgId = (
      map: Map<string, number>,
      name: string | null | undefined
    ): number | null => {
      if (!name) return null;
      return map.get(name.trim().toLowerCase()) ?? null;
    };

    log("Phase write: employees");
    const upserted = await store.upsertEmployeesBatch(
      mapped.map((bundle) => ({
        bambooId: bundle.bambooId,
        employee: bundle.employee,
        departmentId: orgId(departmentsMap, bundle.employee.departmentName),
        divisionId: orgId(divisionsMap, bundle.employee.divisionName),
        locationId: orgId(locationsMap, bundle.employee.locationName),
      })),
      writeProgress("employees")
    );
    for (const [bambooId, id] of upserted.idByBambooId) {
      idByBambooId.set(bambooId, id);
    }
    const created = upserted.created;
    const updated = upserted.updated;

    log("Phase write: time-off policies");
    const policyIds = await store.upsertTimeOffPoliciesBatch(
      timeOffTypes.map((type) => ({ name: type.name, policyType: type.name }))
    );

    const managerLinks = new Map<number, number | null>();
    const unresolvedLinks = new Map<number, string | null>();
    let reportsToResolved = 0;
    for (const bundle of mapped) {
      const employeeId = idByBambooId.get(bundle.bambooId);
      if (!employeeId) continue;
      if (!bundle.supervisorBambooId) {
        managerLinks.set(employeeId, null);
        unresolvedLinks.set(employeeId, null);
        continue;
      }
      const managerId = idByBambooId.get(bundle.supervisorBambooId);
      if (managerId === undefined) {
        managerLinks.set(employeeId, null);
        unresolvedLinks.set(employeeId, bundle.supervisorBambooId);
        continue;
      }
      managerLinks.set(employeeId, managerId);
      unresolvedLinks.set(employeeId, null);
      reportsToResolved += 1;
    }

    for (const pending of await store.listUnresolvedSupervisors()) {
      if (managerLinks.has(pending.employeeId)) continue;
      const managerId = idByBambooId.get(pending.supervisorBambooId);
      if (managerId === undefined) continue;
      managerLinks.set(pending.employeeId, managerId);
      unresolvedLinks.set(pending.employeeId, null);
      reportsToResolved += 1;
    }

    log("Phase write: managers");
    await store.setManagersBatch(
      [...managerLinks.entries()].map(([employeeId, managerId]) => ({
        employeeId,
        managerId,
      })),
      writeProgress("managers")
    );
    log("Phase write: unresolved supervisors");
    await store.setUnresolvedSupervisorsBatch(
      [...unresolvedLinks.entries()].map(([employeeId, supervisorBambooId]) => ({
        employeeId,
        supervisorBambooId,
      })),
      writeProgress("unresolved supervisors")
    );

    const jobReplacements: HistoryReplacement[] = [];
    const statusReplacements: HistoryReplacement[] = [];
    const payReplacements: HistoryReplacement[] = [];
    const contactReplacements: HistoryReplacement[] = [];
    for (const bundle of mapped) {
      const employeeId = idByBambooId.get(bundle.bambooId);
      if (!employeeId) continue;
      const jobs = tableRowsForEmployee(jobInfo, bundle.bambooId, opts.mode);
      if (jobs.replace) {
        jobReplacements.push({
          employeeId,
          rows: jobs.rows.map((row) => ({
            effectiveDate: tableRowDate(row),
            jobTitle: blankToNull(row.jobTitle),
            departmentName: blankToNull(row.department),
            divisionName: blankToNull(row.division),
            locationName: blankToNull(row.location),
            comment: blankToNull(row.comment),
          })),
        });
      }

      const statuses = tableRowsForEmployee(statusInfo, bundle.bambooId, opts.mode);
      if (statuses.replace) {
        statusReplacements.push({
          employeeId,
          rows: statuses.rows.map((row) => {
            const status = mapEmploymentStatus({
              employmentHistoryStatus: blankToNull(row.employmentStatus),
              employmentStatus: blankToNull(row.employmentStatus),
              terminationDate: blankToNull(row.terminationDate),
            });
            return {
              effectiveDate: tableRowDate(row),
              status,
              changeType: status === "terminated" ? "terminate" : "status_change",
              comment: blankToNull(row.comment),
              terminationType:
                blankToNull(row.terminationTypeId) || blankToNull(row.terminationType),
            };
          }),
        });
      }

      const pay = tableRowsForEmployee(compensation, bundle.bambooId, opts.mode);
      if (pay.replace) {
        payReplacements.push({
          employeeId,
          rows: pay.rows.map((row) => {
            const parsed = parsePayRate(
              (row.rate as string | number | null) ?? (row.payRate as string | number | null)
            );
            return {
              effectiveDate: tableRowDate(row),
              payRate: parsed.amount,
              payType: blankToNull(row.type) || blankToNull(row.paidPer),
              paySchedule: blankToNull(row.paySchedule),
              currency: parsed.currency || blankToNull(row.currency) || "CAD",
              changeReason: blankToNull(row.reason),
              comment: blankToNull(row.comment),
            };
          }),
        });
      }

      const emergency = tableRowsForEmployee(contacts, bundle.bambooId, opts.mode);
      if (emergency.replace) {
        contactReplacements.push({
          employeeId,
          rows: emergency.rows
            .map((row) => mapEmergencyContact(row))
            .filter((row): row is NonNullable<typeof row> => Boolean(row)),
        });
      }
    }

    log("Phase write: job_history");
    await store.replaceJobHistoryMany(jobReplacements, writeProgress("job_history"));
    log("Phase write: employment_status_history");
    await store.replaceEmploymentStatusHistoryMany(
      statusReplacements,
      writeProgress("employment_status_history")
    );
    log("Phase write: compensation_history");
    await store.replaceCompensationHistoryMany(
      payReplacements,
      writeProgress("compensation_history")
    );
    log("Phase write: emergency_contacts");
    await store.replaceEmergencyContactsMany(
      contactReplacements,
      writeProgress("emergency_contacts")
    );

    const missingPolicyNames = new Set<string>();
    for (const balances of balancesByBambooId.values()) {
      for (const balance of balances) {
        if (
          !policyIds.has(balance.name.toLowerCase()) &&
          !policyIds.has(balance.name)
        ) {
          missingPolicyNames.add(balance.name);
        }
      }
    }
    if (missingPolicyNames.size > 0) {
      const extraPolicies = await store.upsertTimeOffPoliciesBatch(
        [...missingPolicyNames].map((name) => ({ name, policyType: name }))
      );
      for (const [name, id] of extraPolicies) policyIds.set(name, id);
    }

    const balanceRows: Array<{
      employeeId: number;
      policyId: number;
      sourceBalance: string;
    }> = [];
    for (const [bambooId, balances] of balancesByBambooId) {
      const employeeId = idByBambooId.get(bambooId);
      if (!employeeId) continue;
      for (const balance of balances) {
        const policyId =
          policyIds.get(balance.name.toLowerCase()) ?? policyIds.get(balance.name);
        if (policyId == null) continue;
        balanceRows.push({
          employeeId,
          policyId,
          sourceBalance: balance.balance,
        });
      }
    }
    log("Phase write: time_off_balances");
    await store.upsertTimeOffBalancesBatch(
      balanceRows,
      writeProgress("time_off_balances")
    );

    const datasetCounts = await writeExtendedPayload(
      store,
      extended,
      idByBambooId,
      opts.mode,
      writeProgress,
      log
    );

    const deletedExisting = deletedBambooIds.filter((id) =>
      existingByBambooId.has(id)
    );
    log("Phase write: terminated");
    await store.markTerminatedBatch(deletedExisting, writeProgress("terminated"));

    const brendanAdminBound = await store.applyBrendanCarryOver({
      accessLevel: "full_admin" as AccessLevel,
      vendastaSub: appliedSnapshot?.vendastaSub ?? null,
      userId: appliedSnapshot?.userId ?? null,
    });

    await store.recordSyncRun({
      mode: opts.mode,
      status: "success",
      startedAt,
      finishedAt: new Date().toISOString(),
      employeesFetched: mapped.length,
      employeesCreated: created,
      employeesUpdated: updated,
      demoRemoved,
      latestChanged,
      unmappedFields,
      datasetCounts,
    });

    log(`Upserted ${created} created, ${updated} updated`);
    log(`Reports-to resolved: ${reportsToResolved}`);
    log(
      `Extended datasets timeOffRequests=${datasetCounts.timeOffRequests} jobOpenings=${datasetCounts.jobOpenings} education=${datasetCounts.education} visas=${datasetCounts.visas}`
    );
    log("Phase write: complete");

    return {
      status: "success" as const,
      dryRun: false,
      fetched: mapped.length,
      created,
      updated,
      reportsToResolved,
      demoRemoved,
      brendanAdminBound,
      unmappedFields,
      bambooIds,
      writes: created + updated + demoRemoved + 1,
      latestChanged,
      datasetCounts,
    };
  });
  } catch (error: unknown) {
    const message = safeErrorMessage(
      error instanceof Error ? error.message : "Bamboo sync failed"
    );
    log(`Bamboo sync failed: ${message}`);
    if (!dryRun) {
      await opts.store.recordSyncRun({
        mode: opts.mode,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        errorMessage: message,
      });
    }
    return {
      status: "failed" as const,
      dryRun,
      fetched: mapped.length,
      created: 0,
      updated: 0,
      reportsToResolved: 0,
      demoRemoved: 0,
      brendanAdminBound: false,
      unmappedFields,
      bambooIds,
      writes: dryRun ? 0 : 1,
      latestChanged: null,
      datasetCounts: emptyDatasetCounts(),
      errorMessage: message,
    };
  }
}

export function formatSyncSummary(result: BambooSyncResult): string {
  return [
    `status=${result.status}`,
    `dryRun=${result.dryRun}`,
    `fetched=${result.fetched}`,
    `created=${result.created}`,
    `updated=${result.updated}`,
    `demoRemoved=${result.demoRemoved}`,
    `reportsToResolved=${result.reportsToResolved}`,
    `brendanAdminBound=${result.brendanAdminBound}`,
    `unmappedFields=${result.unmappedFields.join("|") || "(none)"}`,
    `bambooIds=${result.bambooIds.join(",")}`,
    `timeOffRequests=${result.datasetCounts.timeOffRequests}`,
    `jobOpenings=${result.datasetCounts.jobOpenings}`,
    `education=${result.datasetCounts.education}`,
    `visas=${result.datasetCounts.visas}`,
  ].join("\n");
}
