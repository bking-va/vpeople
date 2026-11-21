import { BambooHrClient, BambooHrHttpError } from "./client";
import {
  emptyDatasetCounts,
  mapAtsJob,
  mapEducationRow,
  mapTimeOffRequest,
  mapVisaRow,
  timeOffRequestYears,
} from "./map-extended";
import type { BambooSyncStore } from "./sync";
import type { BatchProgress } from "./chunks";
import type {
  BambooSyncDatasetCounts,
  BambooSyncMode,
  MappedEducationWrite,
  MappedJobOpeningWrite,
  MappedTimeOffRequestWrite,
  MappedVisaWrite,
} from "./types";

export type ExtendedFetchPayload = {
  timeOffPolicies: Array<{ id: string; name: string; timeOffTypeId?: string }>;
  timeOffRequests: Array<Record<string, unknown>>;
  atsStatuses: Array<{ id: string; name: string; code?: number | null; kind?: string }>;
  atsJobs: Array<Record<string, unknown>>;
  education: Record<string, Array<Record<string, unknown>>>;
  visas: Record<string, Array<Record<string, unknown>>>;
};

export function emptyExtendedPayload(): ExtendedFetchPayload {
  return {
    timeOffPolicies: [],
    timeOffRequests: [],
    atsStatuses: [],
    atsJobs: [],
    education: {},
    visas: {},
  };
}

async function fetchOptionalTable(
  client: BambooHrClient,
  table: string
): Promise<Record<string, Array<Record<string, unknown>>> | null> {
  try {
    return await client.fetchAllTableRows(table);
  } catch (error) {
    if (error instanceof BambooHrHttpError && error.status === 404) return null;
    throw error;
  }
}

function mergeTableRows(
  into: Record<string, Array<Record<string, unknown>>>,
  extra: Record<string, Array<Record<string, unknown>>>
) {
  for (const [bambooId, rows] of Object.entries(extra)) {
    into[bambooId] = (into[bambooId] || []).concat(rows);
  }
}

async function resolveTableAliases(
  client: BambooHrClient,
  kind: "education" | "visa"
): Promise<string[]> {
  const fallback =
    kind === "education"
      ? ["education", "employeeEducation"]
      : ["visas", "employeeVisas"];
  const match = (alias: string) => {
    const lower = alias.toLowerCase();
    if (/ssn|sin|bank|iban|routing|credit/.test(lower)) return false;
    return kind === "education" ? /educat/.test(lower) : /visa/.test(lower);
  };
  try {
    const tables = await client.fetchMetaTables();
    const matched = tables.filter(match);
    const names = matched.length > 0 ? matched : fallback;
    for (const name of names) client.allowFullTable(name);
    return names;
  } catch (error) {
    if (error instanceof BambooHrHttpError && error.status === 404) {
      for (const name of fallback) client.allowFullTable(name);
      return fallback;
    }
    throw error;
  }
}

export async function fetchExtendedPayload(
  client: BambooHrClient,
  mode: BambooSyncMode,
  now: Date,
  log: (message: string) => void
): Promise<ExtendedFetchPayload> {
  log("Phase fetch: time-off policies");
  const timeOffPolicies = await client.fetchTimeOffPolicies().catch((error) => {
    if (error instanceof BambooHrHttpError && error.status === 404) return [];
    throw error;
  });

  const years = timeOffRequestYears(mode, now);
  log(`Phase fetch: time-off requests (${years[0]}-${years[years.length - 1]})`);
  const timeOffRequests = await client.fetchTimeOffRequestsForYears(years);
  log(`time-off requests fetched ${timeOffRequests.length}`);

  log("Phase fetch: ATS statuses");
  const atsStatuses = await client.fetchAtsStatuses();
  log(`ATS statuses fetched ${atsStatuses.length}`);

  log("Phase fetch: ATS jobs");
  const atsJobs = await client.fetchAtsJobs();
  log(`ATS jobs fetched ${atsJobs.length}`);

  log("Phase fetch: education");
  const education: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of await resolveTableAliases(client, "education")) {
    const rows = await fetchOptionalTable(client, table);
    if (rows) mergeTableRows(education, rows);
  }
  log(`education employees ${Object.keys(education).length}`);

  log("Phase fetch: visas");
  const visas: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of await resolveTableAliases(client, "visa")) {
    const rows = await fetchOptionalTable(client, table);
    if (rows) mergeTableRows(visas, rows);
  }
  log(`visas employees ${Object.keys(visas).length}`);

  return {
    timeOffPolicies,
    timeOffRequests,
    atsStatuses,
    atsJobs,
    education,
    visas,
  };
}

export function mapExtendedPayload(payload: ExtendedFetchPayload): {
  timeOffRequests: MappedTimeOffRequestWrite[];
  jobOpenings: MappedJobOpeningWrite[];
  education: MappedEducationWrite[];
  visas: MappedVisaWrite[];
  policySeeds: Array<{ name: string; policyType: string; bambooId: string }>;
} {
  const timeOffRequests = payload.timeOffRequests
    .map((row) => mapTimeOffRequest(row))
    .filter((row): row is MappedTimeOffRequestWrite => Boolean(row));
  const statusesById = new Map(
    payload.atsStatuses.map((status) => [
      status.id,
      { code: status.code, name: status.name },
    ])
  );
  const jobOpenings = payload.atsJobs
    .map((row) => mapAtsJob(row, statusesById))
    .filter((row): row is MappedJobOpeningWrite => Boolean(row));
  const education: MappedEducationWrite[] = [];
  for (const [employeeBambooId, rows] of Object.entries(payload.education)) {
    for (const row of rows) {
      const mapped = mapEducationRow(row, employeeBambooId);
      if (mapped) education.push(mapped);
    }
  }
  const visas: MappedVisaWrite[] = [];
  for (const [employeeBambooId, rows] of Object.entries(payload.visas)) {
    for (const row of rows) {
      const mapped = mapVisaRow(row, employeeBambooId);
      if (mapped) visas.push(mapped);
    }
  }
  const policySeeds: Array<{ name: string; policyType: string; bambooId: string }> =
    [];
  for (const policy of payload.timeOffPolicies) {
    if (!policy.name) continue;
    policySeeds.push({
      name: policy.name,
      policyType: policy.name,
      bambooId: `policy:${policy.id}`,
    });
  }
  const seenTypes = new Set<string>();
  for (const request of timeOffRequests) {
    const key = request.typeName.toLowerCase();
    if (seenTypes.has(key)) continue;
    seenTypes.add(key);
    policySeeds.push({
      name: request.typeName,
      policyType: request.typeName,
      bambooId: request.typeBambooId ? `type:${request.typeBambooId}` : `type:${key}`,
    });
  }
  return { timeOffRequests, jobOpenings, education, visas, policySeeds };
}

export async function writeExtendedPayload(
  store: BambooSyncStore,
  payload: ExtendedFetchPayload,
  idByBambooId: Map<string, number>,
  mode: BambooSyncMode,
  progress: (label: string) => BatchProgress,
  log: (message: string) => void
): Promise<BambooSyncDatasetCounts> {
  const mapped = mapExtendedPayload(payload);
  log("Phase write: extended time-off policies");
  const policyIds = await store.upsertTimeOffPoliciesBatch(mapped.policySeeds);

  const requestRows = mapped.timeOffRequests.flatMap((row) => {
    const employeeId = idByBambooId.get(row.employeeBambooId);
    const policyId =
      policyIds.get(row.typeName.toLowerCase()) ?? policyIds.get(row.typeName);
    if (employeeId == null || policyId == null) return [];
    return [
      {
        bambooId: row.bambooId,
        employeeId,
        policyId,
        startDate: row.startDate,
        endDate: row.endDate,
        daysRequested: row.daysRequested,
        status: row.status,
        notes: row.notes,
        reviewNotes: row.reviewNotes,
        reviewedAt: row.reviewedAt,
        createdAt: row.createdAt,
      },
    ];
  });
  log("Phase write: time_off_requests");
  const timeOffRequests = await store.upsertTimeOffRequestsBatch(
    requestRows,
    progress("time_off_requests")
  );

  const departmentNames = mapped.jobOpenings
    .map((row) => row.departmentName)
    .filter((name): name is string => Boolean(name));
  const locationNames = mapped.jobOpenings
    .map((row) => row.locationName)
    .filter((name): name is string => Boolean(name));
  const [departmentsMap, locationsMap] = await Promise.all([
    store.upsertOrgUnits("department", departmentNames),
    store.upsertOrgUnits("location", locationNames),
  ]);
  const jobRows = mapped.jobOpenings.map((row) => ({
    bambooId: row.bambooId,
    title: row.title,
    departmentId: row.departmentName
      ? (departmentsMap.get(row.departmentName.trim().toLowerCase()) ?? null)
      : null,
    locationId: row.locationName
      ? (locationsMap.get(row.locationName.trim().toLowerCase()) ?? null)
      : null,
    hiringLeadId: row.hiringLeadBambooId
      ? (idByBambooId.get(row.hiringLeadBambooId) ?? null)
      : null,
    status: row.status,
    bambooStatusId: row.bambooStatusId,
    bambooStatusLabel: row.bambooStatusLabel,
    employmentType: row.employmentType,
    description: row.description,
    requirements: row.requirements,
    openDate: row.openDate,
    closeDate: row.closeDate,
  }));
  log("Phase write: job_openings");
  const jobOpenings = await store.upsertJobOpeningsBatch(
    jobRows,
    progress("job_openings")
  );

  const educationRows = mapped.education.flatMap((row) => {
    const employeeId = idByBambooId.get(row.employeeBambooId);
    if (employeeId == null) return [];
    return [
      {
        bambooId: row.bambooId,
        employeeId,
        institution: row.institution,
        degree: row.degree,
        fieldOfStudy: row.fieldOfStudy,
        startDate: row.startDate,
        endDate: row.endDate,
        notes: row.notes,
      },
    ];
  });
  log("Phase write: employee_education");
  const education = await store.upsertEducationBatch(
    educationRows,
    progress("employee_education")
  );

  const visaRows = mapped.visas.flatMap((row) => {
    const employeeId = idByBambooId.get(row.employeeBambooId);
    if (employeeId == null) return [];
    return [
      {
        bambooId: row.bambooId,
        employeeId,
        visaType: row.visaType,
        country: row.country,
        documentNumber: row.documentNumber,
        issuedDate: row.issuedDate,
        expiryDate: row.expiryDate,
        status: row.status,
      },
    ];
  });
  log("Phase write: employee_visas");
  const visas = await store.upsertVisasBatch(visaRows, progress("employee_visas"));

  if (mode === "full") {
    log("Phase write: prune stale bamboo rows");
    await store.pruneImportedRowsNotIn(
      "time_off_requests",
      requestRows.map((row) => row.bambooId),
      progress("prune time_off_requests")
    );
    await store.pruneImportedRowsNotIn(
      "job_openings",
      jobRows.map((row) => row.bambooId),
      progress("prune job_openings")
    );
    await store.pruneImportedRowsNotIn(
      "education",
      educationRows.map((row) => row.bambooId),
      progress("prune education")
    );
    await store.pruneImportedRowsNotIn(
      "visas",
      visaRows.map((row) => row.bambooId),
      progress("prune visas")
    );
  }

  return {
    timeOffRequests,
    jobOpenings,
    education,
    visas,
    assets: 0,
    dependents: 0,
    customFields: 0,
    customFieldValues: 0,
    employeeExtras: 0,
    compensationTableRows: 0,
  };
}

export { emptyDatasetCounts };
