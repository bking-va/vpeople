import {
  BAMBOO_HOURS_PER_WORKDAY,
  BRENDAN_WORK_EMAILS,
  EXCLUDED_BAMBOO_FIELDS,
  IMPORTED_EMPLOYEE_FIELDS,
  bambooBalanceToDays,
  collectUnmappedFieldNames,
  isBrendanWorkEmail,
  mapEmergencyContact,
  mapEmployeeRecord,
  mapEmploymentStatus,
  mapGender,
  parsePayRate,
  reconcileImportedTimeOffBalance,
  resolveLoginEmails,
} from "@/lib/bamboo-sync/map";
import {
  BAMBOO_TIME_OFF_REQUEST_END_YEAR,
  BAMBOO_TIME_OFF_REQUEST_START_YEAR,
  mapAtsJob,
  mapEducationRow,
  mapJobOpeningStatus,
  mapTimeOffRequest,
  mapTimeOffRequestStatus,
  mapVisaRow,
  timeOffRequestYears,
} from "@/lib/bamboo-sync/map-extended";
import { isBambooImportedTimeOff } from "@/lib/time-off-imported";
import {
  BambooHrClient,
  parseRetryAfterMs,
} from "@/lib/bamboo-sync/client";
import { parseBambooSyncArgs } from "@/lib/bamboo-sync/cli";
import {
  assertSafeCacheLocation,
  readBambooSyncCache,
  writeBambooSyncCache,
  type BambooSyncSnapshot,
} from "@/lib/bamboo-sync/cache";
import { chmod, mkdtemp, rm, symlink, unlink, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDemoEmployee } from "@/lib/bamboo-sync/demo";
import { runBambooSync, type BambooSyncStore } from "@/lib/bamboo-sync/sync";
import {
  applyBambooWriteGuards,
  createBambooSyncStore,
} from "@/lib/bamboo-sync/store";
import {
  BAMBOO_IDLE_IN_TX_TIMEOUT,
  BAMBOO_LOCK_TIMEOUT,
  BAMBOO_STATEMENT_TIMEOUT,
  BAMBOO_WRITE_CHUNK_SIZE,
  chunkRows,
} from "@/lib/bamboo-sync/chunks";
import { getTableName } from "drizzle-orm";
import type {
  BambooEmployeeRecord,
  MappedEmployee,
  SyncEmployeeRow,
} from "@/lib/bamboo-sync/types";
import { isResumableAtsRun } from "@/lib/bamboo-sync/types";

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

  it("converts hourly Bamboo time-off balances into days", () => {
    expect(BAMBOO_HOURS_PER_WORKDAY).toBe(8);
    expect(bambooBalanceToDays("40", "hours")).toBe("5.00");
    expect(bambooBalanceToDays("8", "Hours")).toBe("1.00");
    expect(bambooBalanceToDays("12.5", "days")).toBe("12.50");
    expect(bambooBalanceToDays("3", "day")).toBe("3.00");
    expect(bambooBalanceToDays("not-a-number", "hours")).toBe("0.00");
    expect(bambooBalanceToDays("16", "hrs")).toBe("2.00");
    expect(bambooBalanceToDays("8", "hourly")).toBe("1.00");
  });

  it("reconciles local usage against the imported Bamboo source balance", () => {
    expect(
      reconcileImportedTimeOffBalance("10.00", [
        { amount: "-3.00", reason: "used:99" },
      ])
    ).toBe("7.00");
    expect(
      reconcileImportedTimeOffBalance("10.00", [
        { amount: "1.25", reason: "accrual:2026-11" },
        { amount: "-2.00", reason: "carryover:2026" },
      ])
    ).toBe("10.00");
    expect(
      reconcileImportedTimeOffBalance("10.00", [
        { amount: "-1.00", reason: "used:12" },
        { amount: "0.50", reason: "manual correction" },
      ])
    ).toBe("9.50");
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

describe("BambooHR extended dataset mapping", () => {
  it("maps time-off request statuses including canceled/superceded without creating pending approvals", () => {
    expect(isBambooImportedTimeOff({ bambooId: "88" })).toBe(true);
    expect(isBambooImportedTimeOff({ bambooId: null })).toBe(false);
    expect(isBambooImportedTimeOff({})).toBe(false);
    expect(mapTimeOffRequestStatus("requested")).toBe("pending");
    expect(mapTimeOffRequestStatus({ status: "approved" })).toBe("approved");
    expect(mapTimeOffRequestStatus("denied")).toBe("denied");
    expect(mapTimeOffRequestStatus("canceled")).toBe("cancelled");
    expect(mapTimeOffRequestStatus("superceded")).toBe("cancelled");
    const mapped = mapTimeOffRequest({
      id: "88",
      employeeId: "101",
      start: "2024-01-02",
      end: "2024-01-03",
      status: { status: "approved", lastChanged: "2024-01-01" },
      type: { id: "7", name: "Vacation" },
      amount: { unit: "hours", amount: "16" },
      notes: { employee: "Trip", manager: "ok" },
      created: "2024-01-01",
    });
    expect(mapped).toMatchObject({
      bambooId: "88",
      employeeBambooId: "101",
      typeName: "Vacation",
      daysRequested: "2.00",
      status: "approved",
      notes: "Trip",
      reviewNotes: "ok",
    });
  });

  it("maps ATS job statuses from the 117-status list onto job_opening_status", () => {
    const statuses = new Map([
      ["4", { code: 2, name: "Open - Engineering" }],
      ["9", { code: 5, name: "Cancelled - Budget" }],
    ]);
    expect(mapJobOpeningStatus({ id: "4", label: "Open - Engineering" }, statuses)).toBe(
      "open"
    );
    expect(mapJobOpeningStatus({ id: "9", label: "Cancelled - Budget" }, statuses)).toBe(
      "canceled"
    );
    expect(mapJobOpeningStatus({ label: "On Hold" })).toBe("on_hold");
    const job = mapAtsJob(
      {
        id: 12,
        title: { label: "Staff Engineer" },
        department: { label: "Technology" },
        location: { label: "Saskatoon HQ" },
        hiringLead: { employeeId: 100 },
        status: { id: 4, label: "Open - Engineering", code: 2 },
        postedDate: "2024-02-01",
      },
      statuses
    );
    expect(job).toMatchObject({
      bambooId: "12",
      title: "Staff Engineer",
      departmentName: "Technology",
      hiringLeadBambooId: "100",
      status: "open",
      bambooStatusLabel: "Open - Engineering",
    });
  });

  it("maps education and visas and drops bank-like visa fields", () => {
    const education = mapEducationRow(
      { id: "3", college: "USask", degree: "BSc", major: "Computer Science" },
      "101"
    );
    expect(education).toMatchObject({
      bambooId: "edu:3",
      employeeBambooId: "101",
      institution: "USask",
      fieldOfStudy: "Computer Science",
    });
    const visa = mapVisaRow(
      {
        id: "9",
        visaType: "TN",
        country: "Canada",
        documentNumber: "VISA-1",
        issued: "2020-01-01",
        ssn: "111-22-3333",
      },
      "101"
    );
    expect(visa).toMatchObject({
      bambooId: "visa:9",
      visaType: "TN",
      country: "Canada",
      documentNumber: "VISA-1",
      issuedDate: "2020-01-01",
    });
    expect(visa).not.toHaveProperty("ssn");
    expect(
      mapVisaRow({ id: "10", visaType: "H-1B", documentNumber: "ssn-secret" }, "101")
        ?.documentNumber
    ).toBeNull();
  });

  it("uses 2020-2027 for full time-off request years and a recent window for incremental", () => {
    expect(timeOffRequestYears("full", new Date("2026-11-19T00:00:00Z"))).toEqual(
      [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]
    );
    expect(BAMBOO_TIME_OFF_REQUEST_START_YEAR).toBe(2020);
    expect(BAMBOO_TIME_OFF_REQUEST_END_YEAR).toBe(2027);
    expect(timeOffRequestYears("incremental", new Date("2026-11-19T00:00:00Z"))).toEqual(
      [2025, 2026, 2027]
    );
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
  employmentStatus?: string | null;
  pendingSupervisorBambooId?: string | null;
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
    sourceBalance: string;
  }> = [];
  timeOffAdjustments: Array<{
    employeeId: number;
    policyId: number;
    amount: string;
    reason: string;
  }> = [];
  syncRuns: Array<Record<string, unknown>> = [];
  timeOffRequests: Array<Record<string, unknown>> = [];
  jobOpenings: Array<Record<string, unknown>> = [];
  education: Array<Record<string, unknown>> = [];
  visas: Array<Record<string, unknown>> = [];
  approvalRequests: Array<Record<string, unknown>> = [];
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
    this.timeOffAdjustments = [];
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

  async setUnresolvedSupervisor(
    employeeId: number,
    supervisorBambooId: string | null
  ): Promise<void> {
    this.writes += 1;
    const row = this.employees.find((emp) => emp.id === employeeId);
    if (row) row.pendingSupervisorBambooId = supervisorBambooId;
  }

  async listUnresolvedSupervisors(): Promise<
    Array<{ employeeId: number; supervisorBambooId: string }>
  > {
    return this.employees.flatMap((row) =>
      row.pendingSupervisorBambooId
        ? [
            {
              employeeId: row.id,
              supervisorBambooId: row.pendingSupervisorBambooId,
            },
          ]
        : []
    );
  }

  async markTerminated(bambooId: string): Promise<void> {
    this.writes += 1;
    const row = this.employees.find((emp) => emp.bambooId === bambooId);
    if (row) row.employmentStatus = "terminated";
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
    sourceBalance: string
  ): Promise<void> {
    this.writes += 1;
    const adjustments = this.timeOffAdjustments.filter(
      (row) => row.employeeId === employeeId && row.policyId === policyId
    );
    const spendable = reconcileImportedTimeOffBalance(sourceBalance, adjustments);
    const existing = this.timeOffBalances.find(
      (row) => row.employeeId === employeeId && row.policyId === policyId
    );
    if (existing) {
      existing.sourceBalance = sourceBalance;
      existing.balance = spendable;
      return;
    }
    this.timeOffBalances.push({
      employeeId,
      policyId,
      sourceBalance,
      balance: spendable,
    });
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
      .find(
        (run) =>
          run.status === "success" &&
          run.latestChanged &&
          run.kind !== "ats_applications"
      );
    return typeof success?.latestChanged === "string" ? success.latestChanged : null;
  }

  async upsertOrgUnits(
    kind: "department" | "division" | "location" | "jobTitle",
    names: string[]
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    for (const name of names) {
      const id = await this.upsertOrgUnit(kind, name);
      if (id != null) map.set(name.trim().toLowerCase(), id);
    }
    return map;
  }

  async upsertEmployeesBatch(
    rows: Array<{
      bambooId: string;
      employee: MappedEmployee;
      departmentId: number | null;
      divisionId: number | null;
      locationId: number | null;
    }>,
    progress?: { chunkSize?: number; onProgress?: (done: number, total: number) => void }
  ): Promise<{
    idByBambooId: Map<string, number>;
    created: number;
    updated: number;
  }> {
    const idByBambooId = new Map<string, number>();
    let created = 0;
    let updated = 0;
    let done = 0;
    for (const row of rows) {
      const result = await this.upsertEmployee(row.bambooId, row.employee);
      idByBambooId.set(row.bambooId, result.id);
      if (result.created) created += 1;
      else updated += 1;
      done += 1;
      progress?.onProgress?.(done, rows.length);
    }
    if (rows.length === 0) progress?.onProgress?.(0, 0);
    return { idByBambooId, created, updated };
  }

  async setManagersBatch(
    links: Array<{ employeeId: number; managerId: number | null }>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<void> {
    let done = 0;
    for (const link of links) {
      await this.setManager(link.employeeId, link.managerId);
      done += 1;
      progress?.onProgress?.(done, links.length);
    }
  }

  async setUnresolvedSupervisorsBatch(
    links: Array<{ employeeId: number; supervisorBambooId: string | null }>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<void> {
    let done = 0;
    for (const link of links) {
      await this.setUnresolvedSupervisor(link.employeeId, link.supervisorBambooId);
      done += 1;
      progress?.onProgress?.(done, links.length);
    }
  }

  async markTerminatedBatch(
    bambooIds: string[],
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<void> {
    let done = 0;
    for (const bambooId of bambooIds) {
      await this.markTerminated(bambooId);
      done += 1;
      progress?.onProgress?.(done, bambooIds.length);
    }
  }

  async replaceJobHistoryMany(
    replacements: Array<{ employeeId: number; rows: Array<Record<string, unknown>> }>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<void> {
    let done = 0;
    for (const item of replacements) {
      await this.replaceJobHistory(item.employeeId, item.rows);
      done += 1;
      progress?.onProgress?.(done, replacements.length);
    }
  }

  async replaceEmploymentStatusHistoryMany(
    replacements: Array<{ employeeId: number; rows: Array<Record<string, unknown>> }>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<void> {
    let done = 0;
    for (const item of replacements) {
      await this.replaceEmploymentStatusHistory(item.employeeId, item.rows);
      done += 1;
      progress?.onProgress?.(done, replacements.length);
    }
  }

  async replaceCompensationHistoryMany(
    replacements: Array<{ employeeId: number; rows: Array<Record<string, unknown>> }>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<void> {
    let done = 0;
    for (const item of replacements) {
      await this.replaceCompensationHistory(item.employeeId, item.rows);
      done += 1;
      progress?.onProgress?.(done, replacements.length);
    }
  }

  async replaceEmergencyContactsMany(
    replacements: Array<{ employeeId: number; rows: Array<Record<string, unknown>> }>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<void> {
    let done = 0;
    for (const item of replacements) {
      await this.replaceEmergencyContacts(item.employeeId, item.rows);
      done += 1;
      progress?.onProgress?.(done, replacements.length);
    }
  }

  async upsertTimeOffPoliciesBatch(
    policies: Array<{ name: string; policyType: string }>
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    for (const policy of policies) {
      const id = await this.upsertTimeOffPolicy(policy.name, policy.policyType);
      map.set(policy.name.toLowerCase(), id);
      map.set(policy.name, id);
    }
    return map;
  }

  async upsertTimeOffBalancesBatch(
    rows: Array<{ employeeId: number; policyId: number; sourceBalance: string }>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<void> {
    let done = 0;
    for (const row of rows) {
      await this.upsertTimeOffBalance(row.employeeId, row.policyId, row.sourceBalance);
      done += 1;
      progress?.onProgress?.(done, rows.length);
    }
  }

  async upsertTimeOffRequestsBatch(
    rows: Array<Record<string, unknown>>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<number> {
    let done = 0;
    for (const row of rows) {
      this.writes += 1;
      const bambooId = String(row.bambooId);
      const existing = this.timeOffRequests.find((item) => item.bambooId === bambooId);
      const next = { ...row, workflowId: null };
      if (existing) Object.assign(existing, next);
      else this.timeOffRequests.push(next);
      done += 1;
      progress?.onProgress?.(done, rows.length);
    }
    return rows.length;
  }

  async upsertJobOpeningsBatch(
    rows: Array<Record<string, unknown>>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<number> {
    let done = 0;
    for (const row of rows) {
      this.writes += 1;
      const bambooId = String(row.bambooId);
      const existing = this.jobOpenings.find((item) => item.bambooId === bambooId);
      if (existing) Object.assign(existing, row);
      else this.jobOpenings.push({ ...row });
      done += 1;
      progress?.onProgress?.(done, rows.length);
    }
    return rows.length;
  }

  async upsertEducationBatch(
    rows: Array<Record<string, unknown>>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<number> {
    let done = 0;
    for (const row of rows) {
      this.writes += 1;
      const bambooId = String(row.bambooId);
      const existing = this.education.find((item) => item.bambooId === bambooId);
      if (existing) Object.assign(existing, row);
      else this.education.push({ ...row });
      done += 1;
      progress?.onProgress?.(done, rows.length);
    }
    return rows.length;
  }

  async upsertVisasBatch(
    rows: Array<Record<string, unknown>>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<number> {
    let done = 0;
    for (const row of rows) {
      this.writes += 1;
      const bambooId = String(row.bambooId);
      const existing = this.visas.find((item) => item.bambooId === bambooId);
      if (existing) Object.assign(existing, row);
      else this.visas.push({ ...row });
      done += 1;
      progress?.onProgress?.(done, rows.length);
    }
    return rows.length;
  }

  candidates: Array<Record<string, unknown>> = [];
  candidateAnswers: Array<Record<string, unknown>> = [];
  candidateComments: Array<Record<string, unknown>> = [];
  candidateHistory: Array<Record<string, unknown>> = [];

  async listJobOpeningIdsByBambooId(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    this.jobOpenings.forEach((row, index) => {
      if (row.bambooId) map.set(String(row.bambooId), Number(row.id ?? index + 1));
    });
    return map;
  }

  async upsertCandidatesBatch(
    rows: Array<Record<string, unknown>>,
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<Map<string, number>> {
    const ids = new Map<string, number>();
    let done = 0;
    for (const row of rows) {
      this.writes += 1;
      const bambooId = String(row.bambooId);
      const existing = this.candidates.find((item) => item.bambooId === bambooId);
      if (existing) Object.assign(existing, row);
      else {
        const id = this.nextId++;
        this.candidates.push({ ...row, id });
      }
      const stored = this.candidates.find((item) => item.bambooId === bambooId);
      ids.set(bambooId, Number(stored?.id));
      done += 1;
      progress?.onProgress?.(done, rows.length);
    }
    return ids;
  }

  async upsertCandidateAnswersBatch(rows: Array<Record<string, unknown>>): Promise<number> {
    this.candidateAnswers.push(...rows);
    this.writes += rows.length;
    return rows.length;
  }

  async upsertCandidateCommentsBatch(rows: Array<Record<string, unknown>>): Promise<number> {
    this.candidateComments.push(...rows);
    this.writes += rows.length;
    return rows.length;
  }

  async upsertCandidateStatusHistoryBatch(rows: Array<Record<string, unknown>>): Promise<number> {
    this.candidateHistory.push(...rows);
    this.writes += rows.length;
    return rows.length;
  }

  async listCandidatesNeedingDetail(limit: number, afterBambooId?: string | null) {
    return this.candidates
      .filter(
        (row) =>
          row.bambooId &&
          !row.atsDetailImportedAt &&
          (!afterBambooId || String(row.bambooId) > afterBambooId)
      )
      .slice(0, limit)
      .map((row) => ({ id: Number(row.id), bambooId: String(row.bambooId) }));
  }

  async listCandidatesNeedingResume(limit: number, afterBambooId?: string | null) {
    return this.candidates
      .filter(
        (row) =>
          row.bambooId &&
          row.resumeBambooFileId &&
          !row.resumeBlobUrl &&
          (!afterBambooId || String(row.bambooId) > afterBambooId)
      )
      .slice(0, limit)
      .map((row) => ({
        id: Number(row.id),
        bambooId: String(row.bambooId),
        resumeBambooFileId: String(row.resumeBambooFileId),
      }));
  }

  async setCandidateResumeBlob(bambooId: string, blobUrl: string): Promise<void> {
    const row = this.candidates.find((item) => item.bambooId === bambooId);
    if (row) row.resumeBlobUrl = blobUrl;
    this.writes += 1;
  }

  async requeueCandidateDetails(): Promise<number> {
    let count = 0;
    for (const row of this.candidates) {
      if (row.bambooId && row.atsDetailImportedAt) {
        row.atsDetailImportedAt = null;
        count += 1;
      }
    }
    return count;
  }

  async markCandidateDetailImported(bambooIds: string[]): Promise<void> {
    for (const id of bambooIds) {
      const row = this.candidates.find((item) => item.bambooId === id);
      if (row) row.atsDetailImportedAt = new Date().toISOString();
    }
  }

  async startSyncRun(run: Record<string, unknown>): Promise<number> {
    this.writes += 1;
    const id = this.nextId++;
    this.syncRuns.push({ ...run, id, status: run.status || "running" });
    return id;
  }

  async updateSyncRun(id: number, run: Record<string, unknown>): Promise<void> {
    this.writes += 1;
    const existing = this.syncRuns.find((item) => item.id === id);
    if (existing) Object.assign(existing, run);
  }

  async lastIncompleteAtsCheckpoint() {
    const row = [...this.syncRuns]
      .reverse()
      .find(
        (item) =>
          item.kind === "ats_applications" &&
          isResumableAtsRun(item.status, item.checkpoint)
      );
    if (!row) return null;
    return {
      id: Number(row.id),
      checkpoint:
        row.checkpoint && typeof row.checkpoint === "object"
          ? (row.checkpoint as Record<string, unknown>)
          : null,
      latestChanged: typeof row.latestChanged === "string" ? row.latestChanged : null,
    };
  }

  async lastSuccessfulAtsCursor(): Promise<string | null> {
    const success = [...this.syncRuns]
      .reverse()
      .find((run) => run.status === "success" && run.kind === "ats_applications");
    return typeof success?.latestChanged === "string" ? success.latestChanged : null;
  }

  async pruneImportedRowsNotIn(
    kind: "time_off_requests" | "job_openings" | "education" | "visas" | "candidates",
    keepBambooIds: string[],
    progress?: { onProgress?: (done: number, total: number) => void }
  ): Promise<number> {
    const keep = new Set(keepBambooIds);
    const collection =
      kind === "time_off_requests"
        ? this.timeOffRequests
        : kind === "job_openings"
          ? this.jobOpenings
          : kind === "education"
            ? this.education
            : kind === "candidates"
              ? this.candidates
              : this.visas;
    const next = collection.filter((row) => keep.has(String(row.bambooId)));
    const removed = collection.length - next.length;
    collection.length = 0;
    collection.push(...next);
    progress?.onProgress?.(keepBambooIds.length, keepBambooIds.length);
    if (removed > 0) this.writes += 1;
    return removed;
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
  tableStatus?: Record<string, number>;
  timeOffTypes?: unknown;
  timeOffPolicies?: unknown;
  timeOffRequests?: unknown;
  balances?: Record<string, unknown>;
  atsStatuses?: unknown;
  atsJobs?: unknown;
  metaTables?: unknown;
  allTables?: Record<string, unknown>;
}): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (url.includes("/reports/custom") && method === "POST") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const all = (handlers.report as { employees?: BambooEmployeeRecord[] })?.employees ?? [];
      const ids: string[] = Array.isArray(body?.filters?.employeeIds)
        ? body.filters.employeeIds.map(String)
        : [];
      const employees = ids.length > 0 ? all.filter((row) => ids.includes(String(row.id))) : all;
      return jsonResponse({ employees });
    }
    if (url.includes("/employees/directory")) {
      return jsonResponse(handlers.directory ?? { employees: [] });
    }
    if (url.includes("/employees/all/tables/")) {
      const table = url.split("/tables/")[1]?.split("?")[0] ?? "";
      return jsonResponse(handlers.allTables?.[table] ?? {});
    }
    if (url.includes("/employees/changed/tables/")) {
      const table = url.split("/tables/")[1]?.split("?")[0] ?? "";
      const status = handlers.tableStatus?.[table];
      if (status && status >= 400) {
        return jsonResponse({ error: "unavailable" }, status);
      }
      return jsonResponse(handlers.tables?.[table] ?? {});
    }
    if (url.includes("/employees/changed")) {
      return jsonResponse(
        handlers.changed ?? { latest: "2026-01-01T00:00:00Z", employees: {} }
      );
    }
    if (url.includes("/time_off/types") && !url.includes("/meta/time_off/types")) {
      return jsonResponse({ error: "not found" }, 404);
    }
    if (url.includes("/meta/time_off/types")) {
      return jsonResponse(handlers.timeOffTypes ?? { timeOffTypes: [] });
    }
    if (url.includes("/meta/time_off/policies")) {
      return jsonResponse(handlers.timeOffPolicies ?? { timeOffPolicies: [] });
    }
    if (url.includes("/time_off/requests")) {
      return jsonResponse(handlers.timeOffRequests ?? []);
    }
    if (url.includes("/time_off/calculator") || url.includes("/time_off/balances")) {
      const id = url.match(/employees\/(\d+)\//)?.[1] ?? "0";
      return jsonResponse(handlers.balances?.[id] ?? []);
    }
    if (url.includes("/applicant_tracking/statuses")) {
      return jsonResponse(
        handlers.atsStatuses ?? { jobOpeningStatuses: [], applicationStatuses: [] }
      );
    }
    if (url.includes("/applicant_tracking/jobs")) {
      return jsonResponse(
        handlers.atsJobs ?? { jobs: [], paginationComplete: true }
      );
    }
    if (url.includes("/meta/tables")) {
      return jsonResponse(handlers.metaTables ?? { tables: [] });
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
      expect((init as RequestInit).redirect).toBe("error");
    }
  });

  it("rejects a subdomain that could change the BambooHR request URL", () => {
    expect(
      () =>
        new BambooHrClient({
          apiKey: "test-key",
          subdomain: "vendasta/../../evil",
        })
    ).toThrow(/BAMBOOHR_SUBDOMAIN is invalid/);
    expect(
      () =>
        new BambooHrClient({
          apiKey: "test-key",
          subdomain: "vendasta.example.com",
        })
    ).toThrow(/BAMBOOHR_SUBDOMAIN is invalid/);
  });

  it("does not interpolate unsafe employee ids into request paths", async () => {
    const fetchMock = mockBambooFetch({
      report: { employees: [] },
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchMock,
    });
    await client.fetchEmployeesByIds(["101", "1/../secret", "2?x=1"]);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/employees\/101\?fields=/),
      ])
    );
    expect(fetchMock.mock.calls.map((call) => String(call[0])).join("\n")).not.toContain(
      "../"
    );
    expect(fetchMock.mock.calls.map((call) => String(call[0])).join("\n")).not.toContain(
      "?x=1"
    );
  });

  it("reads time-off types and policies from /meta and never from /time_off/types", async () => {
    const fetchMock = mockBambooFetch({
      timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation", units: "days" }] },
      timeOffPolicies: { timeOffPolicies: [{ id: "9", name: "FT Vacation", timeOffTypeId: "1" }] },
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchMock,
    });
    await client.fetchTimeOffTypes();
    await client.fetchTimeOffPolicies();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/meta/time_off/types"))).toBe(true);
    expect(urls.some((url) => url.includes("/meta/time_off/policies"))).toBe(true);
    expect(
      urls.some((url) => url.includes("/time_off/types") && !url.includes("/meta/"))
    ).toBe(false);
  });

  it("fetches time-off requests one calendar year at a time", async () => {
    const fetchMock = mockBambooFetch({
      timeOffRequests: [{ id: "1", employeeId: "101" }],
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchMock,
    });
    await client.fetchTimeOffRequestsForYears([2020, 2021]);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("start=2020-01-01"),
        expect.stringContaining("end=2020-12-31"),
        expect.stringContaining("start=2021-01-01"),
        expect.stringContaining("end=2021-12-31"),
      ])
    );
    expect(urls.every((url) => url.includes("/time_off/requests/"))).toBe(true);
  });

  it("fetches ATS jobs once without a page param because Get Job Summaries is unpaginated", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/applicant_tracking/jobs") && url.includes("statusGroups=ALL")) {
        return jsonResponse({
          jobs: [
            { id: 1, title: { label: "One" } },
            { id: 2, title: { label: "Two" } },
          ],
        });
      }
      return jsonResponse({}, 404);
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchMock,
    });
    const jobs = await client.fetchAtsJobs();
    expect(jobs).toHaveLength(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("statusGroups=ALL");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("page=");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not POST custom reports filtered by employeeIds", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (url.includes("/reports/custom") && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body?.filters?.employeeIds) {
          return jsonResponse({ error: "server error" }, 500);
        }
        expect(body.fields).toEqual([...IMPORTED_EMPLOYEE_FIELDS]);
        return jsonResponse({
          employees: [
            { id: "101", firstName: "Ada" },
            { id: "102", firstName: "Grace" },
            { id: "103", firstName: "Alan" },
          ],
        });
      }
      throw new Error(`unexpected ${method} ${url}`);
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchMock,
    });
    const rows = await client.fetchEmployeesByIds(["101", "103"]);
    expect(rows.map((row) => String(row.id))).toEqual(["101", "103"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps only requested employee ids from the unfiltered custom report", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (url.includes("/reports/custom") && method === "POST") {
        return jsonResponse({
          employees: [
            { id: 101, firstName: "Ada" },
            { id: "102", firstName: "Grace" },
            { id: "103", firstName: "Alan" },
          ],
        });
      }
      throw new Error(`unexpected ${method} ${url}`);
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchMock,
    });
    const rows = await client.fetchEmployeesByIds(["101", "103"]);
    expect(rows.map((row) => String(row.id))).toEqual(["101", "103"]);
  });

  it("falls back to per-employee GET when the custom report returns 500", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (url.includes("/reports/custom") && method === "POST") {
        return jsonResponse({ error: "server error" }, 500);
      }
      if (method === "GET" && /\/employees\/101\?fields=/.test(url)) {
        return jsonResponse({ firstName: "Ada" });
      }
      throw new Error(`unexpected ${method} ${url}`);
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchMock,
    });
    const rows = await client.fetchEmployeesByIds(["101"]);
    expect(rows).toEqual([expect.objectContaining({ id: "101", firstName: "Ada" })]);
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

  it("imports historical time-off, jobs, education, and visas without approvals or email", async () => {
    const store = new MemoryStore();
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [ceo, report] },
        timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation", units: "days" }] },
        timeOffPolicies: {
          timeOffPolicies: [{ id: "4", name: "FT Vacation", timeOffTypeId: "1" }],
        },
        timeOffRequests: [
          {
            id: "501",
            employeeId: "101",
            start: "2024-06-03",
            end: "2024-06-04",
            status: { status: "approved", lastChanged: "2024-06-01" },
            type: { id: "1", name: "Vacation" },
            amount: { unit: "days", amount: "2" },
            notes: { employee: "Holiday" },
          },
          {
            id: "502",
            employeeId: "101",
            start: "2026-12-01",
            end: "2026-12-02",
            status: { status: "requested" },
            type: { id: "1", name: "Vacation" },
            amount: { unit: "days", amount: "2" },
          },
        ],
        atsStatuses: {
          jobOpeningStatuses: [{ id: "4", name: "Open", code: 2 }],
        },
        atsJobs: {
          paginationComplete: true,
          jobs: [
            {
              id: 77,
              title: { label: "Platform Engineer" },
              department: { label: "Technology" },
              hiringLead: { employeeId: 100 },
              status: { id: "4", label: "Open", code: 2 },
              postedDate: "2024-01-15",
            },
          ],
        },
        metaTables: { tables: [{ alias: "education" }, { alias: "visas" }] },
        allTables: {
          education: {
            "101": [{ id: "3", college: "USask", degree: "BSc", major: "CS" }],
          },
          visas: {
            "101": [{ id: "9", visaType: "TN", country: "Canada", documentNumber: "TN-1" }],
          },
        },
      }),
    });
    const result = await runBambooSync({ client, store, mode: "full" });
    expect(result.status).toBe("success");
    expect(result.datasetCounts).toEqual({
      timeOffRequests: 2,
      jobOpenings: 1,
      education: 1,
      visas: 1,
    });
    expect(store.timeOffRequests).toHaveLength(2);
    expect(store.timeOffRequests.every((row) => row.workflowId == null)).toBe(true);
    expect(store.timeOffRequests.map((row) => row.status).sort()).toEqual([
      "approved",
      "pending",
    ]);
    expect(store.jobOpenings[0]).toMatchObject({
      bambooId: "77",
      title: "Platform Engineer",
      status: "open",
    });
    expect(store.education[0]).toMatchObject({ institution: "USask" });
    expect(store.visas[0]).toMatchObject({ visaType: "TN", country: "Canada" });
    expect(store.approvalRequests).toHaveLength(0);
    expect(store.webhookCalls).toBe(0);
    expect(store.emailsSent).toBe(0);
  });

  it("fails the run instead of wiping job history when a table fetch errors", async () => {
    const store = new MemoryStore();
    await runBambooSync({ client: clientFor([ceo, report]), store, mode: "full" });
    expect(store.jobHistory.length).toBeGreaterThan(0);
    const historyBefore = store.jobHistory.length;

    const failing = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [ceo, report] },
        tableStatus: { jobInfo: 500 },
        tables: {
          employmentStatus: { "101": [{ date: "2020-01-15", employmentStatus: "Full-Time" }] },
          compensation: {},
        },
        timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation" }] },
      }),
    });
    const result = await runBambooSync({ client: failing, store, mode: "full" });
    expect(result.status).toBe("failed");
    expect(store.jobHistory).toHaveLength(historyBefore);
    expect(store.syncRuns.at(-1)).toMatchObject({ status: "failed" });
  });

  it("resolves incremental reports-to against employees outside the changed batch", async () => {
    const store = new MemoryStore();
    store.employees.push(
      {
        id: 10,
        bambooId: "100",
        email: "bking@vendasta.com",
        employeeNumber: "V-100",
        firstName: "Brendan",
        lastName: "King",
        accessLevel: "full_admin",
        vendastaSub: null,
        userId: null,
        managerId: null,
      },
      {
        id: 11,
        bambooId: "101",
        email: "ada.lovelace@vendasta.com",
        employeeNumber: "V-101",
        firstName: "Ada",
        lastName: "Lovelace",
        accessLevel: "employee",
        vendastaSub: null,
        userId: null,
        managerId: 10,
      }
    );
    store.nextId = 12;
    store.syncRuns.push({
      status: "success",
      latestChanged: "2026-11-01T00:00:00Z",
    });

    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [report] },
        changed: {
          latest: "2026-11-18T00:00:00Z",
          employees: {
            "101": { id: "101", action: "Updated", lastChanged: "2026-11-18T00:00:00Z" },
          },
        },
        tables: { jobInfo: {}, employmentStatus: {}, compensation: {} },
        timeOffTypes: { timeOffTypes: [] },
      }),
    });
    await runBambooSync({ client, store, mode: "incremental" });
    const ada = store.employees.find((row) => row.bambooId === "101");
    expect(ada?.managerId).toBe(10);
  });

  it("clears the former manager when the replacement supervisor is missing and retries later", async () => {
    const store = new MemoryStore();
    store.employees.push(
      {
        id: 10,
        bambooId: "100",
        email: "bking@vendasta.com",
        employeeNumber: "V-100",
        firstName: "Brendan",
        lastName: "King",
        accessLevel: "full_admin",
        vendastaSub: null,
        userId: null,
        managerId: null,
      },
      {
        id: 11,
        bambooId: "101",
        email: "ada.lovelace@vendasta.com",
        employeeNumber: "V-101",
        firstName: "Ada",
        lastName: "Lovelace",
        accessLevel: "employee",
        vendastaSub: null,
        userId: null,
        managerId: 10,
      }
    );
    store.nextId = 12;
    store.syncRuns.push({
      status: "success",
      latestChanged: "2026-11-01T00:00:00Z",
    });

    const reassigned = bambooEmployee({
      id: "101",
      firstName: "Ada",
      lastName: "Lovelace",
      workEmail: "ada.lovelace@vendasta.com",
      supervisorEId: "200",
      department: "Technology",
      jobTitle: "Engineer",
      employmentHistoryStatus: "Full-Time",
      status: "Active",
    });
    const first = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [reassigned] },
        changed: {
          latest: "2026-11-18T00:00:00Z",
          employees: {
            "101": { id: "101", action: "Updated", lastChanged: "2026-11-18T00:00:00Z" },
          },
        },
        tables: { jobInfo: {}, employmentStatus: {}, compensation: {} },
        timeOffTypes: { timeOffTypes: [] },
      }),
    });
    await runBambooSync({ client: first, store, mode: "incremental" });

    const adaAfterClear = store.employees.find((row) => row.bambooId === "101");
    expect(adaAfterClear?.managerId).toBeNull();
    expect(adaAfterClear?.pendingSupervisorBambooId).toBe("200");

    const newBoss = bambooEmployee({
      id: "200",
      firstName: "Grace",
      lastName: "Hopper",
      workEmail: "grace.hopper@vendasta.com",
    });
    const second = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [newBoss] },
        changed: {
          latest: "2026-11-18T01:00:00Z",
          employees: {
            "200": { id: "200", action: "Inserted", lastChanged: "2026-11-18T01:00:00Z" },
          },
        },
        tables: { jobInfo: {}, employmentStatus: {}, compensation: {} },
        timeOffTypes: { timeOffTypes: [] },
      }),
    });
    await runBambooSync({ client: second, store, mode: "incremental" });

    const grace = store.employees.find((row) => row.bambooId === "200");
    const adaAfterRetry = store.employees.find((row) => row.bambooId === "101");
    expect(grace).toBeDefined();
    expect(adaAfterRetry?.managerId).toBe(grace?.id);
    expect(adaAfterRetry?.pendingSupervisorBambooId).toBeNull();
  });

  it("marks deleted Bamboo employees terminated without wiping retained profile fields", async () => {
    const store = new MemoryStore();
    store.employees.push({
      id: 11,
      bambooId: "101",
      email: "ada.lovelace@vendasta.com",
      employeeNumber: "V-101",
      firstName: "Ada",
      lastName: "Lovelace",
      accessLevel: "employee",
      vendastaSub: null,
      userId: null,
      managerId: 10,
      departmentName: "Technology",
      employmentStatus: "full_time",
    });
    store.nextId = 12;
    store.syncRuns.push({
      status: "success",
      latestChanged: "2026-11-01T00:00:00Z",
    });

    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [] },
        changed: {
          latest: "2026-11-18T00:00:00Z",
          employees: {
            "101": { id: "101", action: "Deleted", lastChanged: "2026-11-18T00:00:00Z" },
          },
        },
        tables: {},
        timeOffTypes: { timeOffTypes: [] },
      }),
    });
    await runBambooSync({ client, store, mode: "incremental" });
    const ada = store.employees.find((row) => row.bambooId === "101");
    expect(ada).toMatchObject({
      employeeNumber: "V-101",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada.lovelace@vendasta.com",
      departmentName: "Technology",
      managerId: 10,
      employmentStatus: "terminated",
    });
  });

  it("imports hourly calculator balances as days so deductions stay day-based", async () => {
    const store = new MemoryStore();
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [report] },
        tables: {},
        timeOffTypes: { timeOffTypes: [{ id: "1", name: "Sick", units: "hours" }] },
        balances: {
          "101": [{ name: "Sick", balance: "40", units: "hours" }],
        },
      }),
    });
    await runBambooSync({ client, store, mode: "full" });
    expect(store.timeOffBalances).toEqual([
      expect.objectContaining({ balance: "5.00", sourceBalance: "5.00" }),
    ]);
  });

  it("refreshes time-off balances for imported employees that did not change", async () => {
    const store = new MemoryStore();
    store.employees.push({
      id: 11,
      bambooId: "101",
      email: "ada.lovelace@vendasta.com",
      employeeNumber: "V-101",
      firstName: "Ada",
      lastName: "Lovelace",
      accessLevel: "employee",
      vendastaSub: null,
      userId: null,
      managerId: null,
    });
    store.nextId = 12;
    store.syncRuns.push({
      status: "success",
      latestChanged: "2026-11-01T00:00:00Z",
    });
    store.timeOffPolicies.push({ id: 1, name: "Vacation", policyType: "Vacation" });
    store.timeOffBalances.push({
      employeeId: 11,
      policyId: 1,
      sourceBalance: "1.0",
      balance: "1.0",
    });

    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [] },
        changed: { latest: "2026-11-18T00:00:00Z", employees: {} },
        tables: {},
        timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation" }] },
        balances: {
          "101": [{ name: "Vacation", balance: "12.0" }],
        },
      }),
    });
    await runBambooSync({ client, store, mode: "incremental" });
    expect(store.timeOffBalances).toEqual([
      {
        employeeId: 11,
        policyId: 1,
        sourceBalance: "12.00",
        balance: "12.00",
      },
    ]);
  });

  it("does not restore locally spent leave when Bamboo still reports the pre-approval balance", async () => {
    const store = new MemoryStore();
    const client = clientFor([report]);
    await runBambooSync({ client, store, mode: "full" });
    const ada = store.employees.find((row) => row.bambooId === "101");
    expect(ada).toBeDefined();
    expect(store.timeOffBalances).toEqual([
      expect.objectContaining({
        employeeId: ada?.id,
        sourceBalance: "10.50",
        balance: "10.50",
      }),
    ]);

    store.timeOffAdjustments.push({
      employeeId: ada!.id,
      policyId: store.timeOffBalances[0]!.policyId,
      amount: "-2.00",
      reason: "used:501",
    });
    store.timeOffBalances[0]!.balance = "8.50";
    store.syncRuns.push({
      status: "success",
      latestChanged: "2026-11-18T00:00:00Z",
    });

    const refresh = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [] },
        changed: { latest: "2026-11-18T01:00:00Z", employees: {} },
        tables: {},
        timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation" }] },
        balances: {
          "101": [{ name: "Vacation", balance: "10.5" }],
        },
      }),
    });
    await runBambooSync({ client: refresh, store, mode: "incremental" });
    expect(store.timeOffBalances).toEqual([
      expect.objectContaining({
        employeeId: ada?.id,
        sourceBalance: "10.50",
        balance: "8.50",
      }),
    ]);
  });

  it("includes a used adjustment that lands before the spendable write", async () => {
    const store = new MemoryStore();
    store.employees.push({
      id: 11,
      bambooId: "101",
      email: "ada.lovelace@vendasta.com",
      employeeNumber: "V-101",
      firstName: "Ada",
      lastName: "Lovelace",
      accessLevel: "employee",
      vendastaSub: null,
      userId: null,
      managerId: null,
    });
    store.nextId = 12;
    store.syncRuns.push({
      status: "success",
      latestChanged: "2026-11-01T00:00:00Z",
    });
    store.timeOffPolicies.push({ id: 1, name: "Vacation", policyType: "Vacation" });
    store.timeOffBalances.push({
      employeeId: 11,
      policyId: 1,
      sourceBalance: "10.50",
      balance: "10.50",
    });
    const original = store.upsertTimeOffBalance.bind(store);
    store.upsertTimeOffBalance = async (employeeId, policyId, sourceBalance) => {
      store.timeOffAdjustments.push({
        employeeId,
        policyId,
        amount: "-2.00",
        reason: "used:777",
      });
      return original(employeeId, policyId, sourceBalance);
    };

    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: mockBambooFetch({
        report: { employees: [] },
        changed: { latest: "2026-11-18T00:00:00Z", employees: {} },
        tables: {},
        timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation" }] },
        balances: {
          "101": [{ name: "Vacation", balance: "10.5" }],
        },
      }),
    });
    await runBambooSync({ client, store, mode: "incremental" });
    expect(store.timeOffBalances).toEqual([
      expect.objectContaining({
        employeeId: 11,
        sourceBalance: "10.50",
        balance: "8.50",
      }),
    ]);
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
      atsApplications: false,
      skipResumes: false,
      dbUrlFile: "/tmp/db_url.txt",
      cacheFile: null,
    });
  });

  it("parses --ats-applications and --skip-resumes", () => {
    expect(
      parseBambooSyncArgs([
        "--ats-applications",
        "--skip-resumes",
        "--incremental",
        "/tmp/db_url.txt",
      ])
    ).toEqual({
      dryRun: false,
      replaceDemo: false,
      incremental: true,
      atsApplications: true,
      skipResumes: true,
      dbUrlFile: "/tmp/db_url.txt",
      cacheFile: null,
    });
  });

  it("parses --cache without treating the cache path as the db url file", () => {
    expect(
      parseBambooSyncArgs([
        "--replace-demo",
        "--cache",
        "/tmp/bamboo-sync.bamboo-cache.json",
        "/tmp/db_url.txt",
      ])
    ).toEqual({
      dryRun: false,
      replaceDemo: true,
      incremental: false,
      atsApplications: false,
      skipResumes: false,
      dbUrlFile: "/tmp/db_url.txt",
      cacheFile: "/tmp/bamboo-sync.bamboo-cache.json",
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

  it("can load the Postgres store before DATABASE_URL is set", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    jest.resetModules();
    try {
      await expect(import("@/lib/bamboo-sync/store")).resolves.toEqual(
        expect.objectContaining({ createBambooSyncStore: expect.any(Function) })
      );
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});

describe("BambooHR fast import", () => {
  it("caps Retry-After and falls back to exponential backoff", () => {
    expect(parseRetryAfterMs("2", 0)).toBe(2000);
    expect(parseRetryAfterMs("0", 0)).toBe(0);
    expect(parseRetryAfterMs("120", 0)).toBe(60_000);
    expect(parseRetryAfterMs(null, 0)).toBe(1000);
    expect(parseRetryAfterMs(null, 4)).toBe(16_000);
  });

  it("times out a hung BambooHR request", async () => {
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      timeoutMs: 20,
      maxRetries: 0,
      fetch: jest.fn(() => new Promise<Response>(() => {})),
    });
    await expect(client.fetchAllEmployees()).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("retries 429 calculator responses using Retry-After", async () => {
    let calculatorCalls = 0;
    const inner = mockBambooFetch({
      balances: {
        "42": [{ name: "Vacation", balance: "10", units: "days" }],
      },
    });
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: jest.fn(async (url, init) => {
        if (String(url).includes("time_off/calculator")) {
          calculatorCalls += 1;
          if (calculatorCalls === 1) {
            return new Response("", {
              status: 429,
              headers: { "Retry-After": "0" },
            });
          }
        }
        return inner(url, init);
      }),
    });
    const rows = await client.fetchTimeOffBalances("42", "2026-01-01");
    expect(calculatorCalls).toBe(2);
    expect(rows).toEqual([
      expect.objectContaining({ name: "Vacation", balance: "10.00" }),
    ]);
  });

  it("does not multiply retries when 429 persists", async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response("", {
          status: 429,
          headers: { "Retry-After": "0" },
        })
    );
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      maxRetries: 2,
      fetch: fetchMock,
    });
    await expect(client.fetchAllEmployees()).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("times out if the response body never arrives", async () => {
    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      timeoutMs: 20,
      maxRetries: 0,
      fetch: jest.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => new Promise<string>(() => {}),
          }) as Response
      ),
    });
    await expect(client.fetchAllEmployees()).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("fetches time-off balances with bounded concurrency", async () => {
    const employees = Array.from({ length: 8 }, (_, index) =>
      bambooEmployee({
        id: String(index + 1),
        workEmail: `emp${index + 1}@vendasta.com`,
        firstName: `Emp${index + 1}`,
      })
    );
    let inflight = 0;
    let maxInflight = 0;
    const inner = mockBambooFetch({
      report: { employees },
      tables: { jobInfo: {}, employmentStatus: {}, compensation: {} },
      timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation", units: "days" }] },
      balances: Object.fromEntries(
        employees.map((row) => [String(row.id), [{ name: "Vacation", balance: "1" }]])
      ),
    });
    const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("time_off/calculator")) {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 25));
        inflight -= 1;
      }
      return inner(url, init);
    });
    const store = new MemoryStore();
    const events: string[] = [];
    const originalTransaction = store.transaction.bind(store);
    store.transaction = async (fn) => {
      events.push("tx");
      return originalTransaction(fn);
    };
    const result = await runBambooSync({
      client: new BambooHrClient({
        apiKey: "test-key",
        subdomain: "vendasta",
        concurrency: 4,
        fetch: fetchMock,
      }),
      store,
      mode: "full",
      concurrency: 4,
      progressEvery: 4,
      log: (message) => events.push(message),
    });
    expect(result.status).toBe("success");
    expect(maxInflight).toBeGreaterThan(1);
    expect(maxInflight).toBeLessThanOrEqual(4);
    expect(events.filter((row) => row.startsWith("time-off balances "))).toEqual(
      expect.arrayContaining(["time-off balances 4/8", "time-off balances 8/8"])
    );
    expect(events).toEqual(
      expect.arrayContaining([
        "Phase fetch: employees",
        "Phase fetch: tables",
        "Phase fetch: time-off types",
        "Phase write: starting database transaction",
      ])
    );
    const lastHttp = [...fetchMock.mock.calls.keys()].pop();
    expect(lastHttp).toBeGreaterThanOrEqual(0);
    expect(events.indexOf("tx")).toBeGreaterThan(-1);
  });

  it("completes all HTTP fetches before opening the database transaction", async () => {
    const employees = [
      bambooEmployee({ id: "1", workEmail: "one@vendasta.com" }),
      bambooEmployee({ id: "2", workEmail: "two@vendasta.com" }),
    ];
    const order: string[] = [];
    const inner = mockBambooFetch({
      report: { employees },
      tables: { jobInfo: {}, employmentStatus: {}, compensation: {} },
      timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation" }] },
    });
    const store = new MemoryStore();
    const originalTransaction = store.transaction.bind(store);
    store.transaction = async (fn) => {
      order.push("tx");
      return originalTransaction(fn);
    };
    await runBambooSync({
      client: new BambooHrClient({
        apiKey: "test-key",
        subdomain: "vendasta",
        fetch: async (url, init) => {
          order.push("http");
          return inner(url, init);
        },
      }),
      store,
      mode: "full",
    });
    expect(order.filter((row) => row === "http").length).toBeGreaterThan(0);
    expect(order.indexOf("tx")).toBeGreaterThan(order.lastIndexOf("http"));
  });

  it("uses bulk table endpoints instead of per-employee table GETs", async () => {
    const employees = Array.from({ length: 6 }, (_, index) =>
      bambooEmployee({
        id: String(index + 1),
        workEmail: `bulk${index + 1}@vendasta.com`,
      })
    );
    const fetchMock = mockBambooFetch({
      report: { employees },
      tables: { jobInfo: {}, employmentStatus: {}, compensation: {} },
      timeOffTypes: { timeOffTypes: [] },
    });
    await runBambooSync({
      client: new BambooHrClient({
        apiKey: "test-key",
        subdomain: "vendasta",
        fetch: fetchMock,
      }),
      store: new MemoryStore(),
      mode: "full",
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    for (const call of fetchMock.mock.calls) {
      const method = ((call[1] as RequestInit | undefined)?.method || "GET").toUpperCase();
      if (method === "POST") {
        expect(String(call[0])).toContain("/reports/custom");
      } else {
        expect(method).toBe("GET");
      }
    }
    const tableUrls = urls.filter((url) => url.includes("/changed/tables/"));
    expect(tableUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/changed/tables/jobInfo"),
        expect.stringContaining("/changed/tables/employmentStatus"),
        expect.stringContaining("/changed/tables/compensation"),
      ])
    );
    expect(urls.filter((url) => /\/employees\/\d+\/tables\//.test(url))).toHaveLength(0);
    expect(tableUrls.length).toBeLessThanOrEqual(4);
  });

  it("writes a mode-600 cache and reuses it without refetching", async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "bamboo-sync-cache-"));
    await chmod(cacheDir, 0o700);
    const cachePath = path.join(cacheDir, "bamboo-sync.json");
    const employees = [
      bambooEmployee({ id: "7", workEmail: "cache@vendasta.com", firstName: "Cache" }),
    ];
    const inner = mockBambooFetch({
      report: { employees },
      tables: { jobInfo: {}, employmentStatus: {}, compensation: {} },
      timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation", units: "days" }] },
      balances: { "7": [{ name: "Vacation", balance: "4" }] },
    });
    try {
      const first = await runBambooSync({
        client: new BambooHrClient({
          apiKey: "test-key",
          subdomain: "vendasta",
          fetch: inner,
        }),
        store: new MemoryStore(),
        mode: "full",
        cachePath,
      });
      expect(first.status).toBe("success");
      const info = await stat(cachePath);
      expect(info.mode & 0o777).toBe(0o600);

      const blocked = jest.fn(async () => {
        throw new Error("should not refetch BambooHR when cache exists");
      });
      const store = new MemoryStore();
      const second = await runBambooSync({
        client: new BambooHrClient({
          apiKey: "test-key",
          subdomain: "vendasta",
          fetch: blocked,
        }),
        store,
        mode: "full",
        cachePath,
      });
      expect(second.status).toBe("success");
      expect(blocked).not.toHaveBeenCalled();
      expect(store.employees).toHaveLength(1);
      expect(store.employees[0]?.bambooId).toBe("7");
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("refuses a cache file in a shared directory such as /tmp", async () => {
    const cachePath = path.join(
      os.tmpdir(),
      `bamboo-forged-${process.pid}-${Date.now()}.json`
    );
    const forged: BambooSyncSnapshot = {
      version: 2,
      mode: "full",
      fetchedAt: "2026-01-01T00:00:00Z",
      employees: [
        bambooEmployee({
          id: "99",
          firstName: "Forged",
          lastName: "User",
          workEmail: "forged@vendasta.com",
        }),
      ],
      latestChanged: null,
      deletedBambooIds: [],
      tables: {
        jobInfo: {},
        employmentStatus: {},
        compensation: {},
        emergencyContacts: null,
      },
      timeOffTypes: [],
      balances: {},
      extended: {
        timeOffPolicies: [],
        timeOffRequests: [],
        atsStatuses: [],
        atsJobs: [],
        education: {},
        visas: {},
      },
    };
    await writeFile(cachePath, JSON.stringify(forged), { mode: 0o666 });
    await chmod(cachePath, 0o666);
    const fetchMock = jest.fn(async () => {
      throw new Error("should not fetch or import a shared /tmp cache");
    });
    try {
      await expect(assertSafeCacheLocation(cachePath)).rejects.toThrow(
        /0700|shared directory|owned by the current user/
      );
      const result = await runBambooSync({
        client: new BambooHrClient({
          apiKey: "test-key",
          subdomain: "vendasta",
          fetch: fetchMock,
        }),
        store: new MemoryStore(),
        mode: "full",
        cachePath,
      });
      expect(result.status).toBe("failed");
      expect(result.errorMessage).toMatch(
        /0700|shared directory|owned by the current user/
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await unlink(cachePath).catch(() => undefined);
    }
  });

  it("refuses a world-writable cache file and a symlink even in a private directory", async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "bamboo-sync-cache-"));
    await chmod(cacheDir, 0o700);
    const snapshot: BambooSyncSnapshot = {
      version: 2,
      mode: "full",
      fetchedAt: "2026-01-01T00:00:00Z",
      employees: [
        bambooEmployee({
          id: "8",
          workEmail: "safe@vendasta.com",
          firstName: "Safe",
        }),
      ],
      latestChanged: null,
      deletedBambooIds: [],
      tables: {
        jobInfo: {},
        employmentStatus: {},
        compensation: {},
        emergencyContacts: null,
      },
      timeOffTypes: [],
      balances: {},
      extended: {
        timeOffPolicies: [],
        timeOffRequests: [],
        atsStatuses: [],
        atsJobs: [],
        education: {},
        visas: {},
      },
    };
    try {
      const writablePath = path.join(cacheDir, "writable.json");
      await writeBambooSyncCache(writablePath, snapshot);
      await chmod(writablePath, 0o666);
      await expect(readBambooSyncCache(writablePath)).rejects.toThrow(/0600/);

      const realPath = path.join(cacheDir, "real.json");
      const linkPath = path.join(cacheDir, "link.json");
      await writeBambooSyncCache(realPath, snapshot);
      await symlink(realPath, linkPath);
      await expect(readBambooSyncCache(linkPath)).rejects.toThrow(/symlink/);

      await chmod(cacheDir, 0o755);
      await expect(
        assertSafeCacheLocation(path.join(cacheDir, "open.json"))
      ).rejects.toThrow(/0700|shared directory/);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("logs write-phase table progress without PII", async () => {
    const logs: string[] = [];
    const employees = Array.from({ length: 6 }, (_, index) =>
      bambooEmployee({
        id: String(index + 1),
        firstName: "Secret",
        lastName: "Name",
        workEmail: `secret${index + 1}@vendasta.com`,
        address1: "9 Secret Lane",
        ssn: "111-22-3333",
      })
    );
    await runBambooSync({
      client: new BambooHrClient({
        apiKey: "test-key",
        subdomain: "vendasta",
        fetch: mockBambooFetch({
          report: { employees },
          tables: { jobInfo: {}, employmentStatus: {}, compensation: {} },
          timeOffTypes: { timeOffTypes: [{ id: "1", name: "Vacation" }] },
        }),
      }),
      store: new MemoryStore(),
      mode: "full",
      writeChunkSize: 4,
      log: (message) => logs.push(message),
    });
    expect(logs).toEqual(
      expect.arrayContaining([
        "Phase write: starting database transaction",
        "Phase write: employees",
        "Phase write: managers",
        "Phase write: time_off_balances",
        "Phase write: complete",
      ])
    );
    expect(logs.some((row) => row.startsWith("employees "))).toBe(true);
    const joined = logs.join("\n");
    expect(joined).not.toContain("secret1@vendasta.com");
    expect(joined).not.toContain("111-22-3333");
    expect(joined).not.toContain("9 Secret Lane");
    expect(joined).not.toContain("Secret");
  });
});

type RecordedCall = {
  op: string;
  table?: string;
  size: number;
  sql?: string;
};

function serializeSql(query: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (value == null || depth > 12) return;
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const record = value as {
      sql?: string;
      queryChunks?: unknown;
      value?: unknown;
    };
    if (typeof record.sql === "string") parts.push(record.sql);
    walk(record.queryChunks, depth + 1);
    if (record.value !== undefined && record.value !== record) {
      walk(record.value, depth + 1);
    }
  };
  walk(query);
  return parts.join("");
}

function createRecordingDb() {
  const calls: RecordedCall[] = [];
  let nextId = 1;
  const tables: Record<string, Array<Record<string, unknown>>> = {
    employees: [],
    departments: [],
    divisions: [],
    locations: [],
    job_titles: [],
    time_off_policies: [],
    time_off_balances: [],
    job_history: [],
    employment_status_history: [],
    compensation_history: [],
    emergency_contacts: [],
    bamboo_sync_runs: [],
    time_off_requests: [],
    job_openings: [],
    employee_education: [],
    employee_visas: [],
  };

  function tableName(table: unknown): string {
    try {
      return getTableName(table as never);
    } catch {
      return "unknown";
    }
  }

  function createQuery(op: string, table?: unknown) {
    const state: { op: string; table?: string; values?: Array<Record<string, unknown>> } = {
      op,
      table: table ? tableName(table) : undefined,
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      from(nextTable: unknown) {
        state.table = tableName(nextTable);
        return self();
      },
      where: self,
      values(value: Record<string, unknown> | Array<Record<string, unknown>>) {
        state.values = Array.isArray(value) ? value : [value];
        return self();
      },
      set: self,
      returning: self,
      onConflictDoNothing: self,
      onConflictDoUpdate: self,
      limit: self,
      orderBy: self,
      innerJoin: self,
      leftJoin: self,
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve()
          .then(() => run(state))
          .then(resolve, reject);
      },
    });
    return chain;
  }

  function run(state: {
    op: string;
    table?: string;
    values?: Array<Record<string, unknown>>;
  }) {
    calls.push({
      op: state.op,
      table: state.table,
      size: state.values?.length ?? 0,
    });
    const rows = tables[state.table ?? ""] ?? [];
    if (state.op === "select") return rows.map((row) => ({ ...row }));
    if (state.op === "insert") {
      const created = (state.values ?? []).map((value) => {
        const row = { id: nextId++, ...value };
        rows.push(row);
        return row;
      });
      tables[state.table ?? ""] = rows;
      return created;
    }
    if (state.op === "delete") {
      tables[state.table ?? ""] = [];
      return [];
    }
    return [];
  }

  type RecordingDb = {
    select: () => ReturnType<typeof createQuery>;
    insert: (table: unknown) => ReturnType<typeof createQuery>;
    update: (table: unknown) => ReturnType<typeof createQuery>;
    delete: (table: unknown) => ReturnType<typeof createQuery>;
    execute: (query: unknown) => Promise<unknown[]>;
    transaction: <T>(fn: (tx: RecordingDb) => Promise<T>) => Promise<T>;
  };
  const db: RecordingDb = {
    select: () => createQuery("select"),
    insert: (table: unknown) => createQuery("insert", table),
    update: (table: unknown) => createQuery("update", table),
    delete: (table: unknown) => createQuery("delete", table),
    execute: async (query: unknown) => {
      calls.push({ op: "execute", size: 0, sql: serializeSql(query) });
      return [];
    },
    transaction: async <T>(fn: (tx: RecordingDb) => Promise<T>) => fn(db),
  };

  return {
    db,
    calls,
    roundTrips: () => calls.length,
    insertSizes: (table?: string) =>
      calls
        .filter((call) => call.op === "insert" && (!table || call.table === table))
        .map((call) => call.size),
  };
}

function batchEmployee(bambooId: string): {
  bambooId: string;
  employee: MappedEmployee;
  departmentId: number | null;
  divisionId: number | null;
  locationId: number | null;
} {
  return {
    bambooId,
    employee: {
      employeeNumber: `V-${bambooId}`,
      firstName: "Test",
      middleName: null,
      lastName: "User",
      preferredName: null,
      email: `user${bambooId}@vendasta.com`,
      personalEmail: null,
      workPhone: null,
      extension: null,
      mobilePhone: null,
      homePhone: null,
      jobTitle: "Engineer",
      departmentName: "Technology",
      divisionName: null,
      locationName: null,
      hireDate: "2020-01-01",
      originalHireDate: "2020-01-01",
      terminationDate: null,
      employmentStatus: "full_time",
      accessLevel: "employee",
      gender: null,
      birthDate: null,
      maritalStatus: null,
      nationality: null,
      citizenship: null,
      addressStreet1: null,
      addressStreet2: null,
      addressCity: null,
      addressProvince: null,
      addressPostalCode: null,
      addressCountry: null,
      linkedInUrl: null,
      twitterUrl: null,
    },
    departmentId: null,
    divisionId: null,
    locationId: null,
  };
}

describe("BambooHR batched writes", () => {
  it("splits arrays into write chunks", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(BAMBOO_WRITE_CHUNK_SIZE).toBe(500);
  });

  it("sets statement and idle-in-transaction timeouts on the write transaction", async () => {
    const recorded = createRecordingDb();
    await applyBambooWriteGuards(recorded.db);
    const sqlText = recorded.calls
      .filter((call) => call.op === "execute")
      .map((call) => call.sql)
      .join("\n");
    expect(sqlText).toContain("statement_timeout");
    expect(sqlText).toContain(BAMBOO_STATEMENT_TIMEOUT);
    expect(sqlText).toContain("idle_in_transaction_session_timeout");
    expect(sqlText).toContain(BAMBOO_IDLE_IN_TX_TIMEOUT);
    expect(sqlText).toContain("lock_timeout");
    expect(sqlText).toContain(BAMBOO_LOCK_TIMEOUT);

    const store = createBambooSyncStore(recorded.db);
    expect(store.transaction).toBeDefined();
    await store.transaction!(async () => "ok");
    expect(
      recorded.calls.filter((call) => call.op === "execute").length
    ).toBeGreaterThanOrEqual(6);
  });

  it("upserts employees in chunked inserts, not one statement per row", async () => {
    const recorded = createRecordingDb();
    const store = createBambooSyncStore(recorded.db);
    const rows = Array.from({ length: 1200 }, (_, index) =>
      batchEmployee(String(index + 1))
    );
    const result = await store.upsertEmployeesBatch(rows, { chunkSize: 500 });
    expect(result.created).toBe(1200);
    expect(result.updated).toBe(0);
    expect(result.idByBambooId.size).toBe(1200);
    expect(recorded.insertSizes("employees")).toEqual([500, 500, 200]);
    expect(recorded.roundTrips()).toBeLessThan(10);
    expect(recorded.roundTrips()).toBeLessThan(1200 / 50);
  });

  it("keeps child-table replace round trips O(chunks) for thousands of rows", async () => {
    const recorded = createRecordingDb();
    const store = createBambooSyncStore(recorded.db);
    const replacements = Array.from({ length: 1000 }, (_, index) => ({
      employeeId: index + 1,
      rows: [
        {
          effectiveDate: "2020-01-01",
          jobTitle: "Engineer",
          departmentName: "Technology",
        },
      ],
    }));
    await store.replaceJobHistoryMany(replacements, { chunkSize: 500 });
    expect(recorded.insertSizes("job_history")).toEqual([500, 500]);
    expect(recorded.calls.filter((call) => call.op === "delete").length).toBe(2);
    expect(recorded.roundTrips()).toBeLessThan(20);
    expect(recorded.roundTrips()).toBeLessThan(1000 / 20);
  });

  it("updates time-off balances with the spendable adjustment subquery", async () => {
    const recorded = createRecordingDb();
    const store = createBambooSyncStore(recorded.db);
    const rows = Array.from({ length: 40 }, (_, index) => ({
      employeeId: index + 1,
      policyId: 1,
      sourceBalance: "10.50",
    }));
    await store.upsertTimeOffBalancesBatch(rows, { chunkSize: 20 });
    await store.upsertTimeOffBalancesBatch(rows, { chunkSize: 20 });
    const sqlText = recorded.calls
      .filter((call) => call.op === "execute")
      .map((call) => call.sql)
      .join("\n");
    expect(sqlText).toMatch(/source_balance/i);
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS numeric");
    expect(sqlText).toContain("accrual:%");
    expect(sqlText).toContain("carryover:%");
    expect(recorded.insertSizes("time_off_balances")).toEqual([20, 20]);
    expect(recorded.calls.filter((call) => call.op === "execute").length).toBe(2);
  });

  it("casts date columns in the batched employee UPDATE", async () => {
    const recorded = createRecordingDb();
    const store = createBambooSyncStore(recorded.db);
    const row = batchEmployee("1");
    await store.upsertEmployeesBatch([row], { chunkSize: 10 });
    await store.upsertEmployeesBatch([row], { chunkSize: 10 });
    const sqlText = recorded.calls
      .filter((call) => call.op === "execute")
      .map((call) => call.sql)
      .join("\n");
    expect(sqlText).toMatch(/hire_date/i);
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS date");
    expect(sqlText).toContain("AS employment_status");
    expect(sqlText).toContain("AS gender");
    expect(sqlText).toContain("CAST(v.hire_date AS date)");
    expect(sqlText).toContain("CAST(v.original_hire_date AS date)");
    expect(sqlText).toContain("CAST(v.termination_date AS date)");
    expect(sqlText).toContain("CAST(v.birth_date AS date)");
    expect(sqlText).toContain("CAST(v.employment_status AS employment_status)");
  });

  it("dedupes org-unit names case-insensitively before insert", async () => {
    const recorded = createRecordingDb();
    const store = createBambooSyncStore(recorded.db);
    const ids = await store.upsertOrgUnits("department", [
      "Sales",
      "sales",
      "SALES",
      "Engineering",
    ]);
    expect(recorded.insertSizes("departments")).toEqual([2]);
    expect(ids.get("sales")).toBe(ids.get("Sales".toLowerCase()));
    expect(ids.size).toBe(2);
  });

  it("bounds a 2409-employee employee upsert to a handful of round trips", async () => {
    const recorded = createRecordingDb();
    const store = createBambooSyncStore(recorded.db);
    const rows = Array.from({ length: 2409 }, (_, index) =>
      batchEmployee(String(index + 1))
    );
    await store.upsertEmployeesBatch(rows);
    expect(recorded.insertSizes("employees")).toEqual([500, 500, 500, 500, 409]);
    expect(recorded.roundTrips()).toBeLessThan(12);
  });

  it("upserts time-off requests with explicit casts and never sets workflow_id", async () => {
    const recorded = createRecordingDb();
    const store = createBambooSyncStore(recorded.db);
    await store.upsertTimeOffRequestsBatch(
      [
        {
          bambooId: "501",
          employeeId: 1,
          policyId: 2,
          startDate: "2024-06-03",
          endDate: "2024-06-04",
          daysRequested: "2.00",
          status: "approved",
          notes: "Holiday",
          reviewNotes: null,
          reviewedAt: "2024-06-01",
          createdAt: "2024-06-01",
        },
      ],
      { chunkSize: 50 }
    );
    const sqlText = recorded.calls
      .filter((call) => call.op === "execute")
      .map((call) => call.sql)
      .join("\n");
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS date");
    expect(sqlText).toContain("AS time_off_request_status");
    expect(sqlText).toContain("AS numeric");
    expect(sqlText).toContain("CAST(NULL AS int)");
    expect(sqlText).toContain("workflow_id = NULL");
    expect(sqlText).toContain("ON CONFLICT");
  });

  it("upserts job openings, education, and visas with explicit casts", async () => {
    const recorded = createRecordingDb();
    const store = createBambooSyncStore(recorded.db);
    await store.upsertJobOpeningsBatch(
      [
        {
          bambooId: "77",
          title: "Engineer",
          departmentId: 1,
          locationId: 2,
          hiringLeadId: 3,
          status: "open",
          bambooStatusId: "4",
          bambooStatusLabel: "Open",
          employmentType: "full_time",
          description: null,
          requirements: null,
          openDate: "2024-01-15",
          closeDate: null,
        },
      ],
      { chunkSize: 50 }
    );
    await store.upsertEducationBatch(
      [
        {
          bambooId: "edu:3",
          employeeId: 1,
          institution: "USask",
          degree: "BSc",
          fieldOfStudy: "CS",
          startDate: "2010-09-01",
          endDate: "2014-05-01",
          notes: null,
        },
      ],
      { chunkSize: 50 }
    );
    await store.upsertVisasBatch(
      [
        {
          bambooId: "visa:9",
          employeeId: 1,
          visaType: "TN",
          country: "Canada",
          documentNumber: "TN-1",
          issuedDate: "2020-01-01",
          expiryDate: "2026-01-01",
          status: "active",
        },
      ],
      { chunkSize: 50 }
    );
    const sqlText = recorded.calls
      .filter((call) => call.op === "execute")
      .map((call) => call.sql)
      .join("\n");
    expect(sqlText).toContain("AS job_opening_status");
    expect(sqlText).toContain("CAST(v.open_date AS date)");
    expect(sqlText).toContain("employee_education");
    expect(sqlText).toContain("employee_visas");
    expect(sqlText).toContain("CAST(v.start_date AS date)");
    expect(sqlText).toContain("CAST(v.issued_date AS date)");
    expect(sqlText).toContain("ON CONFLICT");
  });
});
