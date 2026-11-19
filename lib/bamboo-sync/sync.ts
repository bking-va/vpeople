import {
  BAMBOO_SYNC_CACHE_VERSION,
  assertSafeCacheLocation,
  bambooSyncCacheExists,
  readBambooSyncCache,
  writeBambooSyncCache,
  type BambooSyncSnapshot,
} from "./cache";
import {
  BambooHrClient,
  BambooHrHttpError,
  BAMBOO_PROGRESS_EVERY,
} from "./client";
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
  upsertEmployee(
    bambooId: string,
    employee: MappedEmployee
  ): Promise<{ id: number; created: boolean }>;
  setManager(employeeId: number, managerId: number | null): Promise<void>;
  setUnresolvedSupervisor(
    employeeId: number,
    supervisorBambooId: string | null
  ): Promise<void>;
  listUnresolvedSupervisors(): Promise<
    Array<{ employeeId: number; supervisorBambooId: string }>
  >;
  markTerminated(bambooId: string): Promise<void>;
  replaceJobHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void>;
  replaceEmploymentStatusHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void>;
  replaceCompensationHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void>;
  replaceEmergencyContacts(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void>;
  upsertTimeOffPolicy(name: string, policyType: string): Promise<number>;
  upsertTimeOffBalance(
    employeeId: number,
    policyId: number,
    balance: string
  ): Promise<void>;
  applyBrendanCarryOver(opts: BrendanSnapshot): Promise<boolean>;
  recordSyncRun(run: Record<string, unknown>): Promise<void>;
  lastSuccessfulIncrementalCursor(): Promise<string | null>;
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

  mapped = payload.employees
    .map((row) => mapEmployeeRecord(row))
    .filter((row) => row.bambooId);
  bambooIds = uniqueSorted(mapped.map((row) => row.bambooId));
  unmappedFields = uniqueSorted(mapped.flatMap((row) => row.unmappedFields));
  const wouldCreate = mapped.filter((row) => !existingByBambooId.has(row.bambooId)).length;
  const wouldUpdate = mapped.length - wouldCreate;
  const { latestChanged, deletedBambooIds, jobInfo, statusInfo, compensation, contacts, timeOffTypes, balancesByBambooId } =
    payload;

  log(`Fetched ${mapped.length} employees`);
  log(`Bamboo ids: ${bambooIds.join(", ")}`);
  log(`Would create ${wouldCreate}, update ${wouldUpdate}`);
  if (unmappedFields.length > 0) {
    log(`Unmapped fields: ${unmappedFields.join(", ")}`);
  }
  if (opts.replaceDemo) {
    log(`Demo employees that would be removed: ${demoExisting.length}`);
  }

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
    };
  }

  log("Phase write: starting database transaction");
  return await inStoreTransaction(opts.store, async (store) => {
    let demoRemoved = 0;
    let appliedSnapshot = snapshot;
    if (opts.replaceDemo) {
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
    let created = 0;
    let updated = 0;
    const policyIds = new Map<string, number>();
    for (const type of timeOffTypes) {
      policyIds.set(type.name, await store.upsertTimeOffPolicy(type.name, type.name));
    }

    for (const bundle of mapped) {
      if (bundle.employee.departmentName) {
        await store.upsertOrgUnit("department", bundle.employee.departmentName);
      }
      if (bundle.employee.divisionName) {
        await store.upsertOrgUnit("division", bundle.employee.divisionName);
      }
      if (bundle.employee.locationName) {
        await store.upsertOrgUnit("location", bundle.employee.locationName);
      }
      if (bundle.employee.jobTitle) {
        await store.upsertOrgUnit("jobTitle", bundle.employee.jobTitle);
      }
      const result = await store.upsertEmployee(bundle.bambooId, bundle.employee);
      idByBambooId.set(bundle.bambooId, result.id);
      if (result.created) created += 1;
      else updated += 1;
    }

    let reportsToResolved = 0;
    for (const bundle of mapped) {
      const employeeId = idByBambooId.get(bundle.bambooId);
      if (!employeeId) continue;
      if (!bundle.supervisorBambooId) {
        await store.setManager(employeeId, null);
        await store.setUnresolvedSupervisor(employeeId, null);
        continue;
      }
      const managerId = idByBambooId.get(bundle.supervisorBambooId);
      if (managerId === undefined) {
        await store.setManager(employeeId, null);
        await store.setUnresolvedSupervisor(
          employeeId,
          bundle.supervisorBambooId
        );
        continue;
      }
      await store.setManager(employeeId, managerId);
      await store.setUnresolvedSupervisor(employeeId, null);
      reportsToResolved += 1;
    }

    for (const pending of await store.listUnresolvedSupervisors()) {
      const managerId = idByBambooId.get(pending.supervisorBambooId);
      if (managerId === undefined) continue;
      await store.setManager(pending.employeeId, managerId);
      await store.setUnresolvedSupervisor(pending.employeeId, null);
      reportsToResolved += 1;
    }

    for (const bundle of mapped) {
      const employeeId = idByBambooId.get(bundle.bambooId);
      if (!employeeId) continue;
      const jobs = tableRowsForEmployee(jobInfo, bundle.bambooId, opts.mode);
      if (jobs.replace) {
        await store.replaceJobHistory(
          employeeId,
          jobs.rows.map((row) => ({
            effectiveDate: tableRowDate(row),
            jobTitle: blankToNull(row.jobTitle),
            departmentName: blankToNull(row.department),
            divisionName: blankToNull(row.division),
            locationName: blankToNull(row.location),
            comment: blankToNull(row.comment),
          }))
        );
      }

      const statuses = tableRowsForEmployee(statusInfo, bundle.bambooId, opts.mode);
      if (statuses.replace) {
        await store.replaceEmploymentStatusHistory(
          employeeId,
          statuses.rows.map((row) => {
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
          })
        );
      }

      const pay = tableRowsForEmployee(compensation, bundle.bambooId, opts.mode);
      if (pay.replace) {
        await store.replaceCompensationHistory(
          employeeId,
          pay.rows.map((row) => {
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
          })
        );
      }

      const emergency = tableRowsForEmployee(contacts, bundle.bambooId, opts.mode);
      if (emergency.replace) {
        await store.replaceEmergencyContacts(
          employeeId,
          emergency.rows
            .map((row) => mapEmergencyContact(row))
            .filter((row): row is NonNullable<typeof row> => Boolean(row))
        );
      }
    }

    for (const [bambooId, balances] of balancesByBambooId) {
      const employeeId = idByBambooId.get(bambooId);
      if (!employeeId) continue;
      for (const balance of balances) {
        const policyId =
          policyIds.get(balance.name) ??
          (await store.upsertTimeOffPolicy(balance.name, balance.name));
        policyIds.set(balance.name, policyId);
        await store.upsertTimeOffBalance(employeeId, policyId, balance.balance);
      }
    }

    for (const deletedId of deletedBambooIds) {
      if (!existingByBambooId.has(deletedId)) continue;
      await store.markTerminated(deletedId);
    }

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
    });

    log(`Upserted ${created} created, ${updated} updated`);
    log(`Reports-to resolved: ${reportsToResolved}`);

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
  ].join("\n");
}
