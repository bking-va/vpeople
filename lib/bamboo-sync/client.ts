import { bambooBalanceToDays, IMPORTED_EMPLOYEE_FIELDS } from "./map";
import { commentRecordsFromPayload } from "./map-ats";
import { mapPool } from "./pool";
import type { BambooChangedEmployee, BambooEmployeeRecord } from "./types";

export type BambooFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export const BAMBOO_REQUEST_TIMEOUT_MS = 30_000;
export const BAMBOO_MAX_RETRIES = 4;
export const BAMBOO_BALANCE_CONCURRENCY = 6;
export const BAMBOO_MAX_RETRY_AFTER_MS = 60_000;
export const BAMBOO_PROGRESS_EVERY = 50;

export type BambooHrClientOptions = {
  apiKey: string;
  subdomain?: string;
  fetch?: BambooFetch;
  timeoutMs?: number;
  maxRetries?: number;
  concurrency?: number;
};

const EARLIEST_CHANGED = "2010-01-01T00:00:00Z";
const SAFE_SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/i;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const ALLOWED_TABLES = new Set([
  "jobInfo",
  "employmentStatus",
  "compensation",
  "emergencyContacts",
]);
const ALLOWED_FULL_TABLES = new Set([
  "education",
  "employeeEducation",
  "visas",
  "employeeVisas",
]);
export const ATS_APPLICATIONS_MAX_PAGES = 2000;
export const BAMBOO_ATS_DETAIL_CONCURRENCY = 8;

export function assertSafeBambooSubdomain(subdomain: string): string {
  const value = subdomain.trim();
  if (!SAFE_SUBDOMAIN.test(value)) {
    throw new Error("BAMBOOHR_SUBDOMAIN is invalid");
  }
  return value;
}

function pathSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_PATH_SEGMENT.test(trimmed)) {
    throw new Error(`Invalid BambooHR ${label}`);
  }
  return encodeURIComponent(trimmed);
}

export class BambooHrHttpError extends Error {
  readonly method: string;
  readonly path: string;
  readonly status: number;

  constructor(method: string, path: string, status: number) {
    super(`BambooHR ${method} ${path} failed with ${status}`);
    this.name = "BambooHrHttpError";
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfterMs(
  header: string | null | undefined,
  attempt: number
): number {
  const fallback = Math.min(1000 * 2 ** attempt, 16_000);
  if (!header) {
    return fallback;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, BAMBOO_MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - Date.now(), 0), BAMBOO_MAX_RETRY_AFTER_MS);
  }
  return fallback;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableAbortOrNetwork(error: unknown): boolean {
  if (error instanceof BambooHrHttpError) {
    return isRetryableStatus(error.status);
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error.name === "TypeError"
  );
}

function timeoutError(): Error {
  const error = new Error("BambooHR request timed out");
  error.name = "TimeoutError";
  return error;
}

async function awaitUntilAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    throw timeoutError();
  }
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(timeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export function parseBoundedConcurrency(
  raw: string | undefined,
  fallback = BAMBOO_BALANCE_CONCURRENCY
): number {
  const value = Number(raw);
  if (Number.isInteger(value) && value >= 1 && value <= 16) {
    return value;
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function tableRowsForEmployee(
  payload: unknown,
  bambooId: string
): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
    );
  }
  const root = asRecord(payload);
  const direct = root[bambooId];
  if (Array.isArray(direct)) {
    return direct.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
    );
  }
  const employees = asRecord(root.employees);
  const byId = asRecord(employees[bambooId] ?? employees[String(bambooId)]);
  const updated = asRecord(byId.updated);
  const rows = Object.values(updated).filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
  );
  if (rows.length > 0) return rows;
  if (Array.isArray(byId.rows)) {
    return byId.rows.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
    );
  }
  return [];
}

export class BambooHrClient {
  private readonly apiKey: string;
  private readonly subdomain: string;
  private readonly fetchImpl: BambooFetch;
  private atsCommentsGet: "unknown" | "available" | "unavailable" = "unknown";
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly concurrency: number;

  constructor(opts: BambooHrClientOptions) {
    this.apiKey = opts.apiKey;
    this.subdomain = assertSafeBambooSubdomain(opts.subdomain || "vendasta");
    this.fetchImpl = opts.fetch || fetch;
    this.baseUrl = `https://api.bamboohr.com/api/gateway.php/${this.subdomain}/v1`;
    this.timeoutMs = opts.timeoutMs ?? BAMBOO_REQUEST_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? BAMBOO_MAX_RETRIES;
    this.concurrency = opts.concurrency ?? BAMBOO_BALANCE_CONCURRENCY;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: "application/json",
      Authorization: basicAuth(this.apiKey),
      ...extra,
    };
  }

  private async request(
    path: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    const method = (init.method || "GET").toUpperCase();
    if (method !== "GET" && !(method === "POST" && path.startsWith("/reports/custom"))) {
      throw new Error(`BambooHR client is read-only; refused ${method} ${path}`);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await awaitUntilAbort(
          this.fetchImpl(`${this.baseUrl}${path}`, {
            ...init,
            method,
            redirect: "error",
            signal: controller.signal,
            headers: this.headers(init.headers as Record<string, string> | undefined),
          }),
          controller.signal
        );
        if (isRetryableStatus(response.status)) {
          lastError = new BambooHrHttpError(method, path, response.status);
          if (attempt === this.maxRetries) {
            throw lastError;
          }
          await sleep(parseRetryAfterMs(response.headers.get("retry-after"), attempt));
          continue;
        }
        if (!response.ok) {
          throw new BambooHrHttpError(method, path, response.status);
        }
        if (response.status === 204) {
          return null;
        }
        const text = await awaitUntilAbort(response.text(), controller.signal);
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries || !isRetryableAbortOrNetwork(error)) {
          throw error;
        }
        await sleep(parseRetryAfterMs(null, attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  private async requestBinary(
    path: string
  ): Promise<{ body: Buffer; contentType: string | null; filename: string | null }> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await awaitUntilAbort(
          this.fetchImpl(`${this.baseUrl}${path}`, {
            method: "GET",
            redirect: "error",
            signal: controller.signal,
            headers: this.headers({ Accept: "*/*" }),
          }),
          controller.signal
        );
        if (isRetryableStatus(response.status)) {
          lastError = new BambooHrHttpError("GET", path, response.status);
          if (attempt === this.maxRetries) {
            throw lastError;
          }
          await sleep(parseRetryAfterMs(response.headers.get("retry-after"), attempt));
          continue;
        }
        if (!response.ok) {
          throw new BambooHrHttpError("GET", path, response.status);
        }
        const bytes = await awaitUntilAbort(
          response.arrayBuffer(),
          controller.signal
        );
        const disposition = response.headers.get("content-disposition");
        const filenameMatch = disposition?.match(
          /filename\*?=(?:UTF-8''|")?([^\";]+)/i
        );
        return {
          body: Buffer.from(bytes),
          contentType: response.headers.get("content-type"),
          filename: filenameMatch
            ? decodeURIComponent(filenameMatch[1].replace(/"/g, "").trim())
            : null,
        };
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries || !isRetryableAbortOrNetwork(error)) {
          throw error;
        }
        await sleep(parseRetryAfterMs(null, attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  async fetchAllEmployees(): Promise<BambooEmployeeRecord[]> {
    const payload = await this.request("/reports/custom?format=JSON", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "vPeople employee sync",
        fields: [...IMPORTED_EMPLOYEE_FIELDS],
      }),
    });
    const employees = asRecord(payload).employees;
    if (!Array.isArray(employees)) return [];
    return employees.map((row) => row as BambooEmployeeRecord);
  }

  async fetchChangedEmployees(
    since: string
  ): Promise<{ latest: string | null; employees: BambooChangedEmployee[] }> {
    const payload = asRecord(
      await this.request(
        `/employees/changed?since=${encodeURIComponent(since)}`
      )
    );
    const latest = typeof payload.latest === "string" ? payload.latest : null;
    const map = asRecord(payload.employees);
    const employees: BambooChangedEmployee[] = Object.values(map).map((row) => {
      const record = asRecord(row);
      return {
        id: String(record.id ?? ""),
        action: String(record.action ?? "Updated"),
        lastChanged:
          typeof record.lastChanged === "string" ? record.lastChanged : undefined,
      };
    });
    return { latest, employees };
  }

  async fetchEmployeesByIds(ids: string[]): Promise<BambooEmployeeRecord[]> {
    ids = ids.map((id) => id.trim()).filter((id) => SAFE_PATH_SEGMENT.test(id));
    if (ids.length === 0) return [];
    const wanted = new Set(ids);
    try {
      // BambooHR 500s when a custom report combines filters.employeeIds with address fields.
      const employees = await this.fetchAllEmployees();
      if (employees.length > 0) {
        return employees.filter((row) => wanted.has(String(row.id)));
      }
    } catch (error) {
      if (!(error instanceof BambooHrHttpError) || error.status < 500) {
        throw error;
      }
    }
    const fetched: BambooEmployeeRecord[] = [];
    for (const id of ids) {
      const fields = IMPORTED_EMPLOYEE_FIELDS.join(",");
      const row = await this.request(
        `/employees/${pathSegment(id, "employee id")}?fields=${encodeURIComponent(fields)}`
      );
      if (row && typeof row === "object") {
        fetched.push({ id, ...(row as object) } as BambooEmployeeRecord);
      }
    }
    return fetched;
  }

  async fetchTableRows(
    table: string,
    since: string = EARLIEST_CHANGED
  ): Promise<Record<string, Array<Record<string, unknown>>>> {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Invalid BambooHR table`);
    }
    const payload = await this.request(
      `/employees/changed/tables/${pathSegment(table, "table")}?since=${encodeURIComponent(since)}`
    );
    const root = asRecord(payload);
    const result: Record<string, Array<Record<string, unknown>>> = {};
    if (Array.isArray(root)) {
      for (const row of root) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = String(record.employeeId ?? record.id ?? "");
        if (!id) continue;
        result[id] = result[id] || [];
        result[id].push(record);
      }
      return result;
    }
    const employees = asRecord(root.employees);
    const source = Object.keys(employees).length > 0 ? employees : root;
    for (const [bambooId, value] of Object.entries(source)) {
      result[bambooId] = tableRowsForEmployee({ [bambooId]: value, employees: source }, bambooId);
    }
    return result;
  }

  async fetchTimeOffPolicies(): Promise<Array<{ id: string; name: string; timeOffTypeId?: string }>> {
    const payload = await this.request("/meta/time_off/policies");
    const root = asRecord(payload);
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(root.timeOffPolicies)
        ? root.timeOffPolicies
        : [];
    return list
      .map((row) => asRecord(row))
      .map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? row.id ?? "Time Off"),
        timeOffTypeId:
          typeof row.timeOffTypeId === "string" || typeof row.timeOffTypeId === "number"
            ? String(row.timeOffTypeId)
            : undefined,
      }))
      .filter((row) => row.name);
  }

  async fetchTimeOffRequests(
    start: string,
    end: string
  ): Promise<Array<Record<string, unknown>>> {
    const statuses = [
      "approved",
      "denied",
      "canceled",
      "cancelled",
      "requested",
      "superceded",
    ].join(",");
    const payload = await this.request(
      `/time_off/requests/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&status=${encodeURIComponent(statuses)}`
    );
    const root = asRecord(payload);
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(root.requests)
        ? root.requests
        : Array.isArray(root.timeOffRequests)
          ? root.timeOffRequests
          : [];
    return list.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
    );
  }

  async fetchTimeOffRequestsForYears(
    years: number[]
  ): Promise<Array<Record<string, unknown>>> {
    const byId = new Map<string, Record<string, unknown>>();
    for (const year of years) {
      if (!Number.isInteger(year) || year < 2000 || year > 2100) continue;
      const rows = await this.fetchTimeOffRequests(
        `${year}-01-01`,
        `${year}-12-31`
      );
      for (const row of rows) {
        const id = String(asRecord(row).id ?? "");
        if (id) byId.set(id, row);
      }
    }
    return [...byId.values()];
  }

  async fetchAtsStatuses(): Promise<
    Array<{ id: string; name: string; code?: number | null; kind?: string }>
  > {
    const payload = await this.request("/applicant_tracking/statuses");
    const root = asRecord(payload);
    const groups: Array<{ kind: string; rows: unknown }> = [
      { kind: "job", rows: root.jobOpeningStatuses ?? root.jobStatuses },
      { kind: "application", rows: root.applicationStatuses },
      { kind: "status", rows: Array.isArray(payload) ? payload : root.statuses },
    ];
    const out: Array<{ id: string; name: string; code?: number | null; kind?: string }> =
      [];
    const seen = new Set<string>();
    for (const group of groups) {
      if (!Array.isArray(group.rows)) continue;
      for (const row of group.rows) {
        const rec = asRecord(row);
        const id = String(rec.id ?? "");
        const name = String(rec.name ?? rec.label ?? rec.id ?? "");
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        const codeRaw = rec.code ?? rec.raw ?? rec.statusGroup;
        const code = Number(codeRaw);
        out.push({
          id,
          name,
          code: Number.isFinite(code) ? code : null,
          kind:
            typeof rec.type === "string"
              ? rec.type
              : typeof rec.listType === "string"
                ? rec.listType
                : group.kind,
        });
      }
    }
    return out;
  }

  async fetchAtsJobs(): Promise<Array<Record<string, unknown>>> {
    const payload = await this.request(
      `/applicant_tracking/jobs?statusGroups=${encodeURIComponent("ALL")}`
    );
    const root = asRecord(payload);
    const pageJobs = Array.isArray(payload)
      ? payload
      : Array.isArray(root.jobs)
        ? root.jobs
        : [];
    return pageJobs.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
    );
  }

  async fetchAtsApplicationsPage(opts: {
    page: number;
    newSince?: string | null;
  }): Promise<{
    applications: Array<Record<string, unknown>>;
    paginationComplete: boolean;
  }> {
    if (!Number.isInteger(opts.page) || opts.page < 1 || opts.page > ATS_APPLICATIONS_MAX_PAGES) {
      throw new Error("Invalid ATS applications page");
    }
    const params = new URLSearchParams({
      page: String(opts.page),
      applicationStatus: "ALL",
      jobStatusGroups: "ALL",
    });
    if (opts.newSince) {
      params.set("newSince", opts.newSince);
    }
    const payload = await this.request(
      `/applicant_tracking/applications?${params.toString()}`
    );
    const root = asRecord(payload);
    const pageApps = Array.isArray(payload)
      ? payload
      : Array.isArray(root.applications)
        ? root.applications
        : [];
    const applications = pageApps.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
    );
    const paginationComplete =
      root.paginationComplete === true || applications.length === 0;
    return { applications, paginationComplete };
  }

  async fetchAtsApplicationDetail(
    applicationId: string
  ): Promise<Record<string, unknown>> {
    const payload = await this.request(
      `/applicant_tracking/applications/${pathSegment(applicationId, "application id")}`
    );
    return asRecord(payload);
  }

  atsCommentsEndpointAvailable(): boolean | null {
    if (this.atsCommentsGet === "unknown") return null;
    return this.atsCommentsGet === "available";
  }

  async fetchAtsApplicationComments(
    applicationId: string,
    opts?: { commentCount?: number | null }
  ): Promise<Record<string, unknown>[]> {
    if (this.atsCommentsGet === "unavailable") return [];
    const commentCount = opts?.commentCount;
    if (typeof commentCount === "number" && commentCount <= 0) return [];
    if (this.atsCommentsGet === "unknown" && !(typeof commentCount === "number" && commentCount > 0)) {
      return [];
    }
    try {
      const payload = await this.request(
        `/applicant_tracking/applications/${pathSegment(applicationId, "application id")}/comments`
      );
      this.atsCommentsGet = "available";
      return commentRecordsFromPayload(payload);
    } catch (error) {
      if (
        error instanceof BambooHrHttpError &&
        (error.status === 401 ||
          error.status === 403 ||
          error.status === 404 ||
          error.status === 405 ||
          error.status === 501)
      ) {
        if (this.atsCommentsGet !== "available") {
          this.atsCommentsGet = "unavailable";
        }
        return [];
      }
      throw error;
    }
  }

  async fetchFile(
    fileId: string
  ): Promise<{ body: Buffer; contentType: string | null; filename: string | null }> {
    return this.requestBinary(`/files/${pathSegment(fileId, "file id")}`);
  }

  async fetchMetaTables(): Promise<string[]> {
    const payload = await this.request("/meta/tables");
    const root = asRecord(payload);
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(root.tables)
        ? root.tables
        : Object.keys(root);
    const aliases: string[] = [];
    for (const row of list) {
      if (typeof row === "string") {
        aliases.push(row);
        continue;
      }
      const rec = asRecord(row);
      const alias = String(rec.alias ?? rec.name ?? rec.id ?? "");
      if (alias) aliases.push(alias);
    }
    return aliases.filter((alias) => SAFE_PATH_SEGMENT.test(alias));
  }

  async fetchAllTableRows(
    table: string
  ): Promise<Record<string, Array<Record<string, unknown>>>> {
    if (!SAFE_PATH_SEGMENT.test(table) || !this.isAllowedFullTable(table)) {
      throw new Error("Invalid BambooHR table");
    }
    const payload = await this.request(
      `/employees/all/tables/${pathSegment(table, "table")}`
    );
    const root = asRecord(payload);
    const result: Record<string, Array<Record<string, unknown>>> = {};
    if (Array.isArray(root) || Array.isArray(payload)) {
      const list = Array.isArray(payload) ? payload : [];
      for (const row of list) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = String(record.employeeId ?? "");
        if (!id) continue;
        result[id] = result[id] || [];
        result[id].push(record);
      }
      return result;
    }
    for (const [bambooId, value] of Object.entries(root)) {
      if (bambooId === "employees") continue;
      result[bambooId] = tableRowsForEmployee(
        { [bambooId]: value, employees: root },
        bambooId
      );
      if (result[bambooId].length === 0 && Array.isArray(value)) {
        result[bambooId] = value.filter(
          (row): row is Record<string, unknown> =>
            Boolean(row) && typeof row === "object"
        );
      }
    }
    const employees = asRecord(root.employees);
    if (Object.keys(employees).length > 0) {
      for (const [bambooId, value] of Object.entries(employees)) {
        result[bambooId] = tableRowsForEmployee(
          { [bambooId]: value, employees },
          bambooId
        );
      }
    }
    return result;
  }

  allowFullTable(table: string): void {
    if (SAFE_PATH_SEGMENT.test(table)) ALLOWED_FULL_TABLES.add(table);
  }

  private isAllowedFullTable(table: string): boolean {
    return ALLOWED_FULL_TABLES.has(table) || ALLOWED_TABLES.has(table);
  }

  async fetchTimeOffTypes(): Promise<Array<{ id: string; name: string; units?: string }>> {
    const payload = await this.request("/meta/time_off/types");
    const root = asRecord(payload);
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(root.timeOffTypes)
        ? root.timeOffTypes
        : [];
    return list
      .map((row) => asRecord(row))
      .map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? row.id ?? "Time Off"),
        units: typeof row.units === "string" ? row.units : undefined,
      }))
      .filter((row) => row.name);
  }

  async fetchTimeOffBalances(
    bambooId: string,
    asOf: string,
    unitsByName: Map<string, string> = new Map()
  ): Promise<Array<{ name: string; balance: string }>> {
    const payload = await this.request(
      `/employees/${pathSegment(bambooId, "employee id")}/time_off/calculator?start=${encodeURIComponent(asOf)}&end=${encodeURIComponent(asOf)}`
    );
    const list = Array.isArray(payload) ? payload : [];
    return list
      .map((row) => asRecord(row))
      .map((row) => {
        const name = String(row.name ?? row.timeOffType ?? "").trim();
        const rawUnits =
          (typeof row.units === "string" && !/^\d/.test(row.units.trim())
            ? row.units
            : undefined) ||
          (typeof row.unit === "string" && !/^\d/.test(row.unit.trim())
            ? row.unit
            : undefined);
        const rowUnits = rawUnits;
        const units =
          rowUnits ||
          unitsByName.get(name) ||
          unitsByName.get(name.toLowerCase());
        const amount = row.balance ?? row.amount ?? row.total;
        return {
          name,
          balance: bambooBalanceToDays(
            amount as string | number | null | undefined,
            units
          ),
        };
      })
      .filter((row) => row.name);
  }

  async fetchTimeOffBalancesMany(
    bambooIds: string[],
    asOf: string,
    unitsByName: Map<string, string> = new Map(),
    options?: {
      concurrency?: number;
      onProgress?: (done: number, total: number) => void;
    }
  ): Promise<{
    balances: Map<string, Array<{ name: string; balance: string }>>;
    failed: number;
  }> {
    const balances = new Map<string, Array<{ name: string; balance: string }>>();
    if (bambooIds.length === 0) {
      return { balances, failed: 0 };
    }
    let done = 0;
    let failed = 0;
    const concurrency = options?.concurrency ?? this.concurrency;
    await mapPool(bambooIds, concurrency, async (bambooId) => {
      try {
        balances.set(
          bambooId,
          await this.fetchTimeOffBalances(bambooId, asOf, unitsByName)
        );
      } catch {
        failed += 1;
        balances.set(bambooId, []);
      } finally {
        done += 1;
        options?.onProgress?.(done, bambooIds.length);
      }
    });
    return { balances, failed };
  }
}

export function createBambooHrClientFromEnv(
  env: NodeJS.ProcessEnv = process.env
): BambooHrClient | null {
  const apiKey = env.BAMBOOHR_API_KEY?.trim();
  if (!apiKey) return null;
  const timeoutMs = Number(env.BAMBOO_SYNC_TIMEOUT_MS);
  return new BambooHrClient({
    apiKey,
    subdomain: env.BAMBOOHR_SUBDOMAIN?.trim() || "vendasta",
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs >= 1000
        ? timeoutMs
        : BAMBOO_REQUEST_TIMEOUT_MS,
    concurrency: parseBoundedConcurrency(env.BAMBOO_SYNC_CONCURRENCY),
  });
}
