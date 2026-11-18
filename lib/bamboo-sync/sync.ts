import { BambooHrClient } from "./client";
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

  const { employees, latestChanged, deletedBambooIds } = await loadEmployees(
    opts.client,
    opts.store,
    opts.mode
  );
  const mapped = employees
    .map((row) => mapEmployeeRecord(row))
    .filter((row) => row.bambooId);
  const bambooIds = uniqueSorted(mapped.map((row) => row.bambooId));
  const unmappedFields = uniqueSorted(mapped.flatMap((row) => row.unmappedFields));
  const existing = await opts.store.listEmployees();
  const existingByBambooId = new Map(
    existing
      .filter((row) => row.bambooId)
      .map((row) => [row.bambooId as string, row])
  );
  const wouldCreate = mapped.filter((row) => !existingByBambooId.has(row.bambooId)).length;
  const wouldUpdate = mapped.length - wouldCreate;
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

  const tablesSince =
    opts.mode === "incremental"
      ? (await opts.store.lastSuccessfulIncrementalCursor()) || "2010-01-01T00:00:00Z"
      : "2010-01-01T00:00:00Z";
  const emptyTables: Record<string, Array<Record<string, unknown>>> = {};
  const jobInfo =
    (await opts.client.fetchTableRows("jobInfo", tablesSince).catch(() => emptyTables)) ||
    emptyTables;
  const statusInfo =
    (await opts.client
      .fetchTableRows("employmentStatus", tablesSince)
      .catch(() => emptyTables)) || emptyTables;
  const compensation =
    (await opts.client.fetchTableRows("compensation", tablesSince).catch(() => emptyTables)) ||
    emptyTables;
  const contacts =
    (await opts.client
      .fetchTableRows("emergencyContacts", tablesSince)
      .catch(() => emptyTables)) || emptyTables;
  const timeOffTypes = await opts.client.fetchTimeOffTypes().catch(() => []);
  const asOf = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const balancesByBambooId = new Map<string, Array<{ name: string; balance: string }>>();
  for (const bundle of mapped) {
    const balances = await opts.client
      .fetchTimeOffBalances(bundle.bambooId, asOf)
      .catch(() => []);
    balancesByBambooId.set(bundle.bambooId, balances);
  }

  return inStoreTransaction(opts.store, async (store) => {
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

    const idByBambooId = new Map<string, number>();
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
      const managerId = bundle.supervisorBambooId
        ? idByBambooId.get(bundle.supervisorBambooId) ?? null
        : null;
      await store.setManager(employeeId, managerId ?? null);
      if (managerId) reportsToResolved += 1;
    }

    for (const bundle of mapped) {
      const employeeId = idByBambooId.get(bundle.bambooId);
      if (!employeeId) continue;
      const jobs = (jobInfo[bundle.bambooId] || []).map((row) => ({
        effectiveDate: tableRowDate(row),
        jobTitle: blankToNull(row.jobTitle),
        departmentName: blankToNull(row.department),
        divisionName: blankToNull(row.division),
        locationName: blankToNull(row.location),
        comment: blankToNull(row.comment),
      }));
      await store.replaceJobHistory(employeeId, jobs);

      const statuses = (statusInfo[bundle.bambooId] || []).map((row) => {
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
          terminationType: blankToNull(row.terminationTypeId) || blankToNull(row.terminationType),
        };
      });
      await store.replaceEmploymentStatusHistory(employeeId, statuses);

      const payRows = (compensation[bundle.bambooId] || []).map((row) => {
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
      });
      await store.replaceCompensationHistory(employeeId, payRows);

      const emergency = (contacts[bundle.bambooId] || [])
        .map((row) => mapEmergencyContact(row))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      await store.replaceEmergencyContacts(employeeId, emergency);

      const balances = balancesByBambooId.get(bundle.bambooId) || [];
      for (const balance of balances) {
        const policyId =
          policyIds.get(balance.name) ??
          (await store.upsertTimeOffPolicy(balance.name, balance.name));
        policyIds.set(balance.name, policyId);
        await store.upsertTimeOffBalance(employeeId, policyId, balance.balance);
      }
    }

    for (const deletedId of deletedBambooIds) {
      const existingRow = existingByBambooId.get(deletedId);
      if (!existingRow) continue;
      await store.upsertEmployee(deletedId, {
        ...mapEmployeeRecord({
          id: deletedId,
          firstName: existingRow.firstName,
          lastName: existingRow.lastName,
          workEmail: existingRow.email,
          status: "Inactive",
          employmentHistoryStatus: "Terminated",
        }).employee,
        employmentStatus: "terminated",
      });
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
  }).catch(async (error: unknown) => {
    const message = safeErrorMessage(
      error instanceof Error ? error.message : "Bamboo sync failed"
    );
    log(`Bamboo sync failed: ${message}`);
    await opts.store.recordSyncRun({
      mode: opts.mode,
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      errorMessage: message,
    });
    return {
      status: "failed" as const,
      dryRun: false,
      fetched: mapped.length,
      created: 0,
      updated: 0,
      reportsToResolved: 0,
      demoRemoved: 0,
      brendanAdminBound: false,
      unmappedFields,
      bambooIds,
      writes: 1,
      latestChanged,
      errorMessage: message,
    };
  });
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
