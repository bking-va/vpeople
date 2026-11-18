import {
  BRENDAN_WORK_EMAILS,
  EXCLUDED_BAMBOO_FIELDS,
  collectUnmappedFieldNames,
  isBrendanWorkEmail,
  mapEmergencyContact,
  mapEmployeeRecord,
  mapEmploymentStatus,
  mapGender,
  parsePayRate,
  resolveLoginEmails,
} from "@/lib/bamboo-sync/map";
import { BambooHrClient } from "@/lib/bamboo-sync/client";
import { parseBambooSyncArgs } from "@/lib/bamboo-sync/cli";
import { isDemoEmployee } from "@/lib/bamboo-sync/demo";
import { runBambooSync, type BambooSyncStore } from "@/lib/bamboo-sync/sync";
import type {
  BambooEmployeeRecord,
  MappedEmployee,
  SyncEmployeeRow,
} from "@/lib/bamboo-sync/types";

function bambooEmployee(
  overrides: Partial<BambooEmployeeRecord> & { id: string }
): BambooEmployeeRecord {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    workEmail: "ada.lovelace@vendasta.com",
    ...overrides,
  };
}

describe("BambooHR field mapping", () => {
  it("maps core identity, job, and contact fields onto the vPeople employee shape", () => {
    const mapped = mapEmployeeRecord(
      bambooEmployee({
        id: "42",
        employeeNumber: "V-42",
        middleName: "Augusta",
        preferredName: "Ada",
        workEmail: "ada@vendasta.com",
        homeEmail: "ada@example.com",
        workPhone: "306-555-0100",
        workPhoneExtension: "12",
        mobilePhone: "306-555-0199",
        homePhone: "306-555-0111",
        jobTitle: "Engineer",
        department: "Technology",
        division: "R&D",
        location: "Saskatoon HQ",
        hireDate: "2020-01-15",
        originalHireDate: "2018-06-01",
        employmentHistoryStatus: "Full-Time",
        status: "Active",
        supervisorEId: "7",
        gender: "Female",
        dateOfBirth: "1990-12-10",
        maritalStatus: "Single",
        nationality: "Canadian",
        address1: "123 Main",
        address2: "Suite 4",
        city: "Saskatoon",
        state: "SK",
        zipcode: "S7K 1A1",
        country: "Canada",
        linkedIn: "https://linkedin.com/in/ada",
        twitterFeed: "https://twitter.com/ada",
      })
    );

    expect(mapped.bambooId).toBe("42");
    expect(mapped.supervisorBambooId).toBe("7");
    expect(mapped.employee).toMatchObject({
      employeeNumber: "V-42",
      firstName: "Ada",
      middleName: "Augusta",
      lastName: "Lovelace",
      preferredName: "Ada",
      email: "ada@vendasta.com",
      personalEmail: "ada@example.com",
      workPhone: "306-555-0100",
      extension: "12",
      mobilePhone: "306-555-0199",
      homePhone: "306-555-0111",
      jobTitle: "Engineer",
      departmentName: "Technology",
      divisionName: "R&D",
      locationName: "Saskatoon HQ",
      hireDate: "2020-01-15",
      originalHireDate: "2018-06-01",
      employmentStatus: "full_time",
      accessLevel: "employee",
      gender: "female",
      birthDate: "1990-12-10",
      maritalStatus: "Single",
      nationality: "Canadian",
      addressStreet1: "123 Main",
      addressStreet2: "Suite 4",
      addressCity: "Saskatoon",
      addressProvince: "SK",
      addressPostalCode: "S7K 1A1",
      addressCountry: "Canada",
      linkedInUrl: "https://linkedin.com/in/ada",
      twitterUrl: "https://twitter.com/ada",
    });
  });

  it("maps employment status values including terminated and leave", () => {
    expect(
      mapEmploymentStatus({
        status: "Active",
        employmentHistoryStatus: "Full-Time",
      })
    ).toBe("full_time");
    expect(
      mapEmploymentStatus({
        status: "Active",
        employmentHistoryStatus: "Part-Time",
      })
    ).toBe("part_time");
    expect(
      mapEmploymentStatus({
        status: "Active",
        employmentHistoryStatus: "Contractor",
      })
    ).toBe("contractor");
    expect(
      mapEmploymentStatus({
        status: "Active",
        employmentHistoryStatus: "Furloughed",
      })
    ).toBe("on_leave");
    expect(
      mapEmploymentStatus({
        status: "Inactive",
        employmentHistoryStatus: "Terminated",
        terminationDate: "2024-01-01",
      })
    ).toBe("terminated");
    expect(
      mapEmploymentStatus({ status: "Inactive", terminationDate: "2024-01-01" })
    ).toBe("terminated");
  });

  it("maps gender values onto the vPeople enum", () => {
    expect(mapGender("Male")).toBe("male");
    expect(mapGender("Female")).toBe("female");
    expect(mapGender("Non-binary")).toBe("non_binary");
    expect(mapGender("Prefer not to say")).toBe("prefer_not_to_say");
    expect(mapGender("Something else")).toBe("other");
    expect(mapGender("")).toBeNull();
  });

  it("uses work email for login and keeps personal mailboxes access-restricted", () => {
    expect(
      resolveLoginEmails({
        bambooId: "1",
        workEmail: "pat@vendasta.com",
        homeEmail: "pat@gmail.com",
      })
    ).toEqual({ email: "pat@vendasta.com", personalEmail: "pat@gmail.com" });

    expect(
      resolveLoginEmails({
        bambooId: "2",
        workEmail: "pat@gmail.com",
        homeEmail: null,
      })
    ).toEqual({ email: "pat@gmail.com", personalEmail: "pat@gmail.com" });

    expect(
      resolveLoginEmails({ bambooId: "3", workEmail: null, homeEmail: null })
    ).toEqual({
      email: "bamboo-3@users.invalid",
      personalEmail: null,
    });
  });

  it("does not import SIN, SSN, or bank fields even when Bamboo returns them", () => {
    const mapped = mapEmployeeRecord(
      bambooEmployee({
        id: "9",
        ssn: "123-45-6789",
        sin: "123456789",
        nationalId: "AB123",
        nin: "QQ123456C",
        passportNumber: "P123",
        bankAccountNumber: "999888",
        bankRoutingNumber: "021000021",
        payRate: "$100,000.00 USD",
      })
    );

    const values = JSON.stringify(mapped.employee);
    expect(values).not.toContain("123-45-6789");
    expect(values).not.toContain("123456789");
    expect(values).not.toContain("999888");
    expect(values).not.toContain("021000021");
    expect(mapped.employee).not.toHaveProperty("sin");
    expect(mapped.employee).not.toHaveProperty("ssn");
    expect(mapped.employee).not.toHaveProperty("bankAccountNumber");
    expect(EXCLUDED_BAMBOO_FIELDS).toEqual(
      expect.arrayContaining([
        "ssn",
        "sin",
        "nationalId",
        "nin",
        "passportNumber",
        "bankAccountNumber",
        "bankRoutingNumber",
      ])
    );
  });

  it("reports Bamboo fields that have no vPeople column", () => {
    const unmapped = collectUnmappedFieldNames({
      id: "1",
      firstName: "Ada",
      ethnicity: "Decline to specify",
      eeo: "Professionals",
      facebook: "fb.com/ada",
      payGroup: "Salaried",
    });
    expect(unmapped).toEqual(
      expect.arrayContaining(["ethnicity", "eeo", "facebook", "payGroup"])
    );
    expect(unmapped).not.toContain("firstName");
    expect(unmapped).not.toContain("ssn");
  });

  it("parses compensation rates without exposing them via the mapper logs", () => {
    expect(parsePayRate("$72,000.00 USD")).toEqual({
      amount: "72000.00",
      currency: "USD",
    });
    expect(parsePayRate("85000.5")).toEqual({
      amount: "85000.50",
      currency: null,
    });
    expect(parsePayRate(null)).toEqual({ amount: null, currency: null });
  });

  it("maps emergency contacts and drops bank-like fields", () => {
    const contact = mapEmergencyContact({
      name: "Ada's Contact",
      relationship: "Spouse",
      mobilePhone: "555-0100",
      homePhone: "555-0101",
      email: "contact@example.com",
      primaryContact: "1",
      ssn: "should-not-import",
    });
    expect(contact).toMatchObject({
      name: "Ada's Contact",
      relationship: "Spouse",
      phone: "555-0100",
      alternatePhone: "555-0101",
      email: "contact@example.com",
      isPrimary: true,
    });
    expect(contact).not.toHaveProperty("ssn");
  });
});

describe("Brendan identity", () => {
  it("recognizes the real Bamboo work email and the demo seed email", () => {
    expect(isBrendanWorkEmail("bking@vendasta.com")).toBe(true);
    expect(isBrendanWorkEmail("Brendan.King@vendasta.com")).toBe(true);
    expect(isBrendanWorkEmail("ada@vendasta.com")).toBe(false);
    expect(BRENDAN_WORK_EMAILS).toEqual(
      expect.arrayContaining(["bking@vendasta.com", "brendan.king@vendasta.com"])
    );
  });
});

type MemoryEmployee = SyncEmployeeRow & {
  departmentName?: string | null;
  divisionName?: string | null;
  locationName?: string | null;
};

class MemoryStore implements BambooSyncStore {
  employees: MemoryEmployee[] = [];
  jobHistory: Array<Record<string, unknown>> = [];
  statusHistory: Array<Record<string, unknown>> = [];
  compensation: Array<Record<string, unknown>> = [];
  emergencyContacts: Array<Record<string, unknown>> = [];
  timeOffPolicies: Array<{ id: number; name: string; policyType: string }> = [];
  timeOffBalances: Array<{
    employeeId: number;
    policyId: number;
    balance: string;
  }> = [];
  syncRuns: Array<Record<string, unknown>> = [];
  writes = 0;
  nextId = 1;
  webhookCalls = 0;
  emailsSent = 0;

  async listEmployees(): Promise<SyncEmployeeRow[]> {
    return this.employees.map((row) => ({ ...row }));
  }

  async replaceDemoEmployees(): Promise<{
    removed: number;
    brendanSnapshot: {
      accessLevel: SyncEmployeeRow["accessLevel"];
      vendastaSub: string | null;
      userId: string | null;
    } | null;
  }> {
    this.writes += 1;
    const brendan =
      this.employees.find(
        (row) =>
          row.employeeNumber === "E001" || isBrendanWorkEmail(row.email)
      ) ?? null;
    const snapshot = brendan
      ? {
          accessLevel: brendan.accessLevel,
          vendastaSub: brendan.vendastaSub,
          userId: brendan.userId,
        }
      : null;
    const removed = this.employees.length;
    this.employees = [];
    this.jobHistory = [];
    this.statusHistory = [];
    this.compensation = [];
    this.emergencyContacts = [];
    this.timeOffBalances = [];
    return { removed, brendanSnapshot: snapshot };
  }

  async upsertOrgUnit(
    kind: "department" | "division" | "location" | "jobTitle",
    name: string
  ): Promise<number | null> {
    this.writes += 1;
    return name ? Math.abs(name.length) : null;
  }

  async upsertEmployee(
    bambooId: string,
    employee: MappedEmployee
  ): Promise<{ id: number; created: boolean }> {
    this.writes += 1;
    const existing = this.employees.find((row) => row.bambooId === bambooId);
    if (existing) {
      Object.assign(existing, employee, { bambooId, id: existing.id });
      return { id: existing.id, created: false };
    }
    const row: MemoryEmployee = {
      id: this.nextId++,
      bambooId,
      email: employee.email,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      accessLevel: employee.accessLevel,
      vendastaSub: null,
      userId: null,
      managerId: null,
      departmentName: employee.departmentName,
      divisionName: employee.divisionName,
      locationName: employee.locationName,
    };
    this.employees.push(row);
    return { id: row.id, created: true };
  }

  async setManager(employeeId: number, managerId: number | null): Promise<void> {
    this.writes += 1;
    const row = this.employees.find((emp) => emp.id === employeeId);
    if (row) row.managerId = managerId;
  }

  async replaceJobHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void> {
    this.writes += 1;
    this.jobHistory = this.jobHistory.filter((row) => row.employeeId !== employeeId);
    this.jobHistory.push(...rows.map((row) => ({ ...row, employeeId })));
  }

  async replaceEmploymentStatusHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void> {
    this.writes += 1;
    this.statusHistory = this.statusHistory.filter(
      (row) => row.employeeId !== employeeId
    );
    this.statusHistory.push(...rows.map((row) => ({ ...row, employeeId })));
  }

  async replaceCompensationHistory(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void> {
    this.writes += 1;
    this.compensation = this.compensation.filter(
      (row) => row.employeeId !== employeeId
    );
    this.compensation.push(...rows.map((row) => ({ ...row, employeeId })));
  }

  async replaceEmergencyContacts(
    employeeId: number,
    rows: Array<Record<string, unknown>>
  ): Promise<void> {
    this.writes += 1;
    this.emergencyContacts = this.emergencyContacts.filter(
      (row) => row.employeeId !== employeeId
    );
    this.emergencyContacts.push(...rows.map((row) => ({ ...row, employeeId })));
  }

  async upsertTimeOffPolicy(name: string, policyType: string): Promise<number> {
    this.writes += 1;
    const existing = this.timeOffPolicies.find((row) => row.name === name);
    if (existing) return existing.id;
    const row = { id: this.timeOffPolicies.length + 1, name, policyType };
    this.timeOffPolicies.push(row);
    return row.id;
  }

  async upsertTimeOffBalance(
    employeeId: number,
    policyId: number,
    balance: string
  ): Promise<void> {
    this.writes += 1;
    const existing = this.timeOffBalances.find(
      (row) => row.employeeId === employeeId && row.policyId === policyId
    );
    if (existing) {
      existing.balance = balance;
      return;
    }
    this.timeOffBalances.push({ employeeId, policyId, balance });
  }

  async applyBrendanCarryOver(opts: {
    accessLevel: SyncEmployeeRow["accessLevel"];
    vendastaSub: string | null;
    userId: string | null;
  }): Promise<boolean> {
    this.writes += 1;
    const brendan = this.employees.find((row) => isBrendanWorkEmail(row.email));
    if (!brendan) return false;
    brendan.accessLevel = opts.accessLevel;
    brendan.vendastaSub = opts.vendastaSub;
    brendan.userId = opts.userId;
    return true;
  }

  async recordSyncRun(run: Record<string, unknown>): Promise<void> {
    this.writes += 1;
    this.syncRuns.push(run);
  }

  async lastSuccessfulIncrementalCursor(): Promise<string | null> {
    const success = [...this.syncRuns]
      .reverse()
      .find((run) => run.status === "success" && run.latestChanged);
    return typeof success?.latestChanged === "string" ? success.latestChanged : null;
  }

  async transaction<T>(fn: (store: BambooSyncStore) => Promise<T>): Promise<T> {
    return fn(this);
  }

  emitWebhook(): void {
    this.webhookCalls += 1;
  }

  sendEmail(): void {
    this.emailsSent += 1;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockBambooFetch(handlers: {
  directory?: unknown;
  report?: unknown;
  changed?: unknown;
  tables?: Record<string, unknown>;
  timeOffTypes?: unknown;
  balances?: Record<string, unknown>;
}): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (url.includes("/reports/custom") && method === "POST") {
      return jsonResponse(handlers.report ?? { employees: [] });
    }
    if (url.includes("/employees/directory")) {
      return jsonResponse(handlers.directory ?? { employees: [] });
    }
    if (url.includes("/employees/changed/tables/")) {
      const table = url.split("/tables/")[1]?.split("?")[0] ?? "";
      return jsonResponse(handlers.tables?.[table] ?? {});
    }
    if (url.includes("/employees/changed")) {
      return jsonResponse(
        handlers.changed ?? { latest: "2026-01-01T00:00:00Z", employees: {} }
      );
    }
    if (url.includes("/meta/time_off/types") || url.includes("/time_off/types")) {
      return jsonResponse(handlers.timeOffTypes ?? { timeOffTypes: [] });
    }
    if (url.includes("/time_off/calculator") || url.includes("/time_off/balances")) {
      const id = url.match(/employees\/(\d+)\//)?.[1] ?? "0";
      return jsonResponse(handlers.balances?.[id] ?? []);
    }
    if (/\/employees\/\d+/.test(url) && method === "GET") {
      const id = url.match(/\/employees\/(\d+)/)?.[1] ?? "0";
      const employees = (handlers.report as { employees?: BambooEmployeeRecord[] })
        ?.employees;
      const found = employees?.find((row) => String(row.id) === id);
      return jsonResponse(found ?? {});
    }
    return jsonResponse({}, 404);
  });
}

describe("BambooHR client", () => {
  it("authenticates with the API key as username and never writes to BambooHR", async () => {
    const fetchMock = mockBambooFetch({
      report: { employees: [{ id: "1", firstName: "Ada", lastName: "Lovelace" }] },
    });
    const client = new BambooHrClient({
      apiKey: "super-secret-key",
      subdomain: "vendasta",
      fetch: fetchMock,
    });
    await client.fetchAllEmployees();
    expect(fetchMock).toHaveBeenCalled();
    for (const call of fetchMock.mock.calls) {
      const url = String(call[0]);
      const init = (call[1] ?? {}) as RequestInit;
      const method = (init.method || "GET").toUpperCase();
      expect(["GET", "POST"]).toContain(method);
      if (method === "POST") {
        expect(url).toContain("/reports/custom");
      }
      expect(url).not.toMatch(/\/(PUT|PATCH|DELETE)/i);
      const auth = (init.headers as Record<string, string>)?.Authorization;
      expect(auth).toBe(
        `Basic ${Buffer.from("super-secret-key:x").toString("base64")}`
      );
    }
  });
});

describe("runBambooSync", () => {
  const ceo = bambooEmployee({
    id: "100",
    firstName: "Brendan",
    lastName: "King",
    workEmail: "bking@vendasta.com",
    jobTitle: "CEO",
    department: "Senior Leadership",
    hireDate: "2008-03-15",
    employmentHistoryStatus: "Full-Time",
    status: "Active",
  });
  const report = bambooEmployee({
    id: "101",
    firstName: "Ada",
    lastName: "Lovelace",
    workEmail: "ada.lovelace@vendasta.com",
    supervisorEId: "100",
    department: "Technology",
    jobTitle: "Engineer",
    employmentHistoryStatus: "Full-Time",
    status: "Active",
    ssn: "111-22-3333",
    payRate: "$90,000.00 USD",
    dateOfBirth: "1985-05-05",
    address1: "9 Secret Lane",
  });

  function clientFor(employees: BambooEmployeeRecord[]) {
    return new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees },
        changed: {
          latest: "2026-11-18T00:00:00Z",
          employees: Object.fromEntries(
            employees.map((row) => [
              String(row.id),
              { id: String(row.id), action: "Updated", lastChanged: "2026-11-18T00:00:00Z" },
            ])
          ),
        },
        tables: {
          jobInfo: {
            "101": [
              {
                date: "2020-01-15",
                jobTitle: "Engineer",
                department: "Technology",
                location: "Saskatoon HQ",
                reportsTo: "Brendan King",
              },
            ],
          },
          employmentStatus: {
            "101": [{ date: "2020-01-15", employmentStatus: "Full-Time" }],
          },
          compensation: {
            "101": [
              {
                startDate: "2020-01-15",
                rate: "90000.00",
                type: "Salary",
                paidPer: "Year",
                currency: "USD",
              },
            ],
          },
        },
        timeOffTypes: {
          timeOffTypes: [{ id: "1", name: "Vacation", units: "days" }],
        },
        balances: {
          "101": [{ timeOffType: "Vacation", balance: "10.5", name: "Vacation" }],
        },
      }),
    });
  }

  it("upserts idempotently by Bamboo employee id and does not duplicate on re-run", async () => {
    const store = new MemoryStore();
    const client = clientFor([ceo, report]);
    const first = await runBambooSync({ client, store, mode: "full" });
    const second = await runBambooSync({ client, store, mode: "full" });

    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(2);
    expect(store.employees.filter((row) => row.bambooId === "101")).toHaveLength(1);
    expect(store.employees).toHaveLength(2);
  });

  it("resolves reports-to after every employee exists", async () => {
    const store = new MemoryStore();
    await runBambooSync({ client: clientFor([report, ceo]), store, mode: "full" });
    const ada = store.employees.find((row) => row.bambooId === "101");
    const brendan = store.employees.find((row) => row.bambooId === "100");
    expect(brendan?.managerId).toBeNull();
    expect(ada?.managerId).toBe(brendan?.id);
  });

  it("carries E001 admin access and vendasta_sub onto the real Brendan record", async () => {
    const store = new MemoryStore();
    store.employees.push({
      id: 1,
      bambooId: null,
      email: "brendan.king@vendasta.com",
      employeeNumber: "E001",
      firstName: "Brendan",
      lastName: "King",
      accessLevel: "full_admin",
      vendastaSub: "U-real-brendan-sub",
      userId: "user-1",
      managerId: null,
    });
    store.nextId = 2;

    const result = await runBambooSync({
      client: clientFor([ceo, report]),
      store,
      mode: "full",
      replaceDemo: true,
    });

    expect(result.demoRemoved).toBe(1);
    expect(result.brendanAdminBound).toBe(true);
    const brendan = store.employees.find((row) => row.email === "bking@vendasta.com");
    expect(brendan?.accessLevel).toBe("full_admin");
    expect(brendan?.vendastaSub).toBe("U-real-brendan-sub");
    expect(brendan?.bambooId).toBe("100");
    const ada = store.employees.find((row) => row.bambooId === "101");
    expect(ada?.accessLevel).toBe("employee");
  });

  it("does not auto-grant admin from Bamboo job title or department", async () => {
    const store = new MemoryStore();
    await runBambooSync({
      client: clientFor([
        bambooEmployee({
          id: "200",
          firstName: "Pat",
          lastName: "Hr",
          workEmail: "pat.hr@vendasta.com",
          jobTitle: "Chief People Officer",
          department: "People Operations",
        }),
      ]),
      store,
      mode: "full",
    });
    expect(store.employees[0]?.accessLevel).toBe("employee");
  });

  it("writes nothing on dry-run and still reports counts, bamboo ids, and unmapped fields", async () => {
    const store = new MemoryStore();
    store.employees.push({
      id: 1,
      bambooId: null,
      email: "brendan.king@vendasta.com",
      employeeNumber: "E001",
      firstName: "Brendan",
      lastName: "King",
      accessLevel: "full_admin",
      vendastaSub: "U-sub",
      userId: null,
      managerId: null,
    });
    const logs: string[] = [];
    const result = await runBambooSync({
      client: clientFor([ceo, report]),
      store,
      mode: "full",
      dryRun: true,
      replaceDemo: true,
      log: (message) => logs.push(message),
    });

    expect(result.dryRun).toBe(true);
    expect(result.fetched).toBe(2);
    expect(result.writes).toBe(0);
    expect(store.writes).toBe(0);
    expect(store.employees).toHaveLength(1);
    expect(store.employees[0]?.email).toBe("brendan.king@vendasta.com");
    expect(result.bambooIds).toEqual(expect.arrayContaining(["100", "101"]));
    expect(result.unmappedFields.length).toBeGreaterThanOrEqual(0);
    const joined = logs.join("\n");
    expect(joined).not.toMatch(/test-key/i);
    expect(joined).not.toContain("111-22-3333");
    expect(joined).not.toContain("90000");
    expect(joined).not.toContain("1985-05-05");
    expect(joined).not.toContain("9 Secret Lane");
    expect(joined).not.toContain("bking@vendasta.com");
    expect(joined).not.toContain("Ada");
  });

  it("never logs PII or the API key during a real sync", async () => {
    const store = new MemoryStore();
    const logs: string[] = [];
    await runBambooSync({
      client: clientFor([ceo, report]),
      store,
      mode: "full",
      log: (message) => logs.push(message),
    });
    const joined = logs.join("\n");
    expect(joined).not.toMatch(/test-key/);
    expect(joined).not.toContain("111-22-3333");
    expect(joined).not.toContain("$90,000");
    expect(joined).not.toContain("1985-05-05");
    expect(joined).not.toContain("9 Secret Lane");
    expect(store.webhookCalls).toBe(0);
    expect(store.emailsSent).toBe(0);
  });

  it("is a logged no-op when the API key is missing", async () => {
    const store = new MemoryStore();
    const logs: string[] = [];
    const result = await runBambooSync({
      client: null,
      store,
      mode: "incremental",
      log: (message) => logs.push(message),
    });
    expect(result.status).toBe("skipped");
    expect(store.writes).toBe(1);
    expect(store.syncRuns[0]).toMatchObject({ status: "skipped" });
    expect(logs.join("\n")).toMatch(/BAMBOOHR_API_KEY/i);
  });

  it("does not fire webhooks or emails while importing", async () => {
    const store = new MemoryStore();
    await runBambooSync({ client: clientFor([ceo]), store, mode: "full" });
    expect(store.webhookCalls).toBe(0);
    expect(store.emailsSent).toBe(0);
  });
});

describe("CLI args and demo detection", () => {
  it("parses dry-run, replace-demo, and a db url file path", () => {
    expect(
      parseBambooSyncArgs(["--dry-run", "--replace-demo", "/tmp/db_url.txt"])
    ).toEqual({
      dryRun: true,
      replaceDemo: true,
      incremental: false,
      dbUrlFile: "/tmp/db_url.txt",
    });
  });

  it("treats unmapped E0xx seed rows as demo and leaves imported bamboo rows alone", () => {
    expect(
      isDemoEmployee({
        bambooId: null,
        email: "brendan.king@vendasta.com",
        employeeNumber: "E001",
      })
    ).toBe(true);
    expect(
      isDemoEmployee({
        bambooId: "100",
        email: "bking@vendasta.com",
        employeeNumber: "E001",
      })
    ).toBe(false);
  });
});
