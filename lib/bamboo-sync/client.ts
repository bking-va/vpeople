import { IMPORTED_EMPLOYEE_FIELDS } from "./map";
import type { BambooChangedEmployee, BambooEmployeeRecord } from "./types";

export type BambooFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type BambooHrClientOptions = {
  apiKey: string;
  subdomain?: string;
  fetch?: BambooFetch;
};

const EARLIEST_CHANGED = "2010-01-01T00:00:00Z";

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
  readonly baseUrl: string;

  constructor(opts: BambooHrClientOptions) {
    this.apiKey = opts.apiKey;
    this.subdomain = opts.subdomain || "vendasta";
    this.fetchImpl = opts.fetch || fetch;
    this.baseUrl = `https://api.bamboohr.com/api/gateway.php/${this.subdomain}/v1`;
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
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      method,
      headers: this.headers(init.headers as Record<string, string> | undefined),
    });
    if (!response.ok) {
      throw new BambooHrHttpError(method, path, response.status);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
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
    if (ids.length === 0) return [];
    const payload = await this.request("/reports/custom?format=JSON", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "vPeople employee sync incremental",
        filters: { employeeIds: ids },
        fields: [...IMPORTED_EMPLOYEE_FIELDS],
      }),
    });
    const employees = asRecord(payload).employees;
    if (Array.isArray(employees) && employees.length > 0) {
      return employees.map((row) => row as BambooEmployeeRecord);
    }
    const fetched: BambooEmployeeRecord[] = [];
    for (const id of ids) {
      const fields = IMPORTED_EMPLOYEE_FIELDS.join(",");
      const row = await this.request(`/employees/${id}?fields=${encodeURIComponent(fields)}`);
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
    const payload = await this.request(
      `/employees/changed/tables/${table}?since=${encodeURIComponent(since)}`
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
    asOf: string
  ): Promise<Array<{ name: string; balance: string }>> {
    const payload = await this.request(
      `/employees/${bambooId}/time_off/calculator?start=${asOf}&end=${asOf}`
    );
    const list = Array.isArray(payload) ? payload : [];
    return list
      .map((row) => asRecord(row))
      .map((row) => ({
        name: String(row.name ?? row.timeOffType ?? "").trim(),
        balance: String(row.balance ?? row.units ?? "0"),
      }))
      .filter((row) => row.name);
  }
}

export function createBambooHrClientFromEnv(
  env: NodeJS.ProcessEnv = process.env
): BambooHrClient | null {
  const apiKey = env.BAMBOOHR_API_KEY?.trim();
  if (!apiKey) return null;
  return new BambooHrClient({
    apiKey,
    subdomain: env.BAMBOOHR_SUBDOMAIN?.trim() || "vendasta",
  });
}
