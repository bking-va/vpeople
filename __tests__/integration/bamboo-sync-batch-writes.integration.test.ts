/**
 * Real Postgres coverage for batched Bamboo writes: typed VALUES updates must
 * commit a termination onto an existing employee, and SSO must then deny.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  bambooSyncRuns,
  compensationHistory,
  emergencyContacts,
  employees,
  employmentStatusHistory,
  jobHistory,
  timeOffBalanceAdjustments,
  timeOffBalances,
  timeOffPolicies,
} from "@/lib/db/schema";
import { createBambooSyncStore } from "@/lib/bamboo-sync/store";
import type { MappedEmployee } from "@/lib/bamboo-sync/types";
import { decideVendastaEmployeeAccess } from "@/lib/vendasta-oidc";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for integration tests"
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {
  schema: {
    employees,
    jobHistory,
    employmentStatusHistory,
    compensationHistory,
    emergencyContacts,
    timeOffPolicies,
    timeOffBalances,
    timeOffBalanceAdjustments,
    bambooSyncRuns,
  },
});

function mappedEmployee(
  overrides: Partial<MappedEmployee> &
    Pick<MappedEmployee, "firstName" | "lastName" | "email">
): MappedEmployee {
  return {
    employeeNumber: null,
    middleName: null,
    preferredName: null,
    personalEmail: null,
    workPhone: null,
    extension: null,
    mobilePhone: null,
    homePhone: null,
    jobTitle: "Engineer",
    departmentName: "Technology",
    divisionName: null,
    locationName: "Saskatoon HQ",
    hireDate: "2020-01-15",
    originalHireDate: "2018-06-01",
    terminationDate: null,
    employmentStatus: "full_time",
    accessLevel: "employee",
    gender: "female",
    birthDate: "1990-12-10",
    maritalStatus: "Single",
    nationality: "Canadian",
    citizenship: null,
    addressStreet1: "123 Main",
    addressStreet2: null,
    addressCity: "Saskatoon",
    addressProvince: "SK",
    addressPostalCode: "S7K 1A1",
    addressCountry: "Canada",
    linkedInUrl: null,
    twitterUrl: null,
    ...overrides,
  };
}

describe("BambooHR batched writes (Real Postgres)", () => {
  const runId = Date.now();
  const bambooId = `BATCH_TERM_${runId}`;
  const managerBambooId = `BATCH_MGR_${runId}`;
  const newHireBambooId = `BATCH_NEW_${runId}`;
  const vendastaSub = `U-batch${runId}`;
  const employeeIds: number[] = [];
  let policyId: number | null = null;

  afterAll(async () => {
    try {
      for (const id of employeeIds) {
        const balances = await db
          .select({ id: timeOffBalances.id })
          .from(timeOffBalances)
          .where(eq(timeOffBalances.employeeId, id));
        for (const balance of balances) {
          await db
            .delete(timeOffBalanceAdjustments)
            .where(eq(timeOffBalanceAdjustments.balanceId, balance.id));
        }
        await db.delete(timeOffBalances).where(eq(timeOffBalances.employeeId, id));
        await db.delete(jobHistory).where(eq(jobHistory.employeeId, id));
        await db
          .delete(employmentStatusHistory)
          .where(eq(employmentStatusHistory.employeeId, id));
        await db
          .delete(compensationHistory)
          .where(eq(compensationHistory.employeeId, id));
        await db
          .delete(emergencyContacts)
          .where(eq(emergencyContacts.employeeId, id));
      }
      if (employeeIds.length > 0) {
        for (const id of employeeIds) {
          await db.delete(employees).where(eq(employees.id, id));
        }
      }
      if (policyId) {
        await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, policyId));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("terminating an existing employee via batched VALUES commits and SSO denies", async () => {
    const [manager] = await db
      .insert(employees)
      .values({
        employeeNumber: `BM_${runId}`,
        bambooId: managerBambooId,
        firstName: "Batch",
        lastName: "Manager",
        email: `batch.mgr.${runId}@vendasta.com`,
        hireDate: "2015-01-01",
        originalHireDate: "2015-01-01",
        employmentStatus: "full_time",
        accessLevel: "manager",
      })
      .returning();
    employeeIds.push(manager.id);

    const [existing] = await db
      .insert(employees)
      .values({
        employeeNumber: `BT_${runId}`,
        bambooId,
        firstName: "Active",
        lastName: "Employee",
        email: `batch.term.${runId}@vendasta.com`,
        vendastaSub,
        hireDate: "2020-01-15",
        originalHireDate: "2018-06-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        gender: "female",
        birthDate: "1990-12-10",
      })
      .returning();
    employeeIds.push(existing.id);

    const allowedBefore = decideVendastaEmployeeAccess(
      { sub: vendastaSub },
      {
        id: existing.id,
        email: existing.email,
        vendastaSub,
        userId: existing.userId,
        accessLevel: existing.accessLevel,
        employmentStatus: existing.employmentStatus,
      },
      null
    );
    expect(allowedBefore.ok).toBe(true);

    const store = createBambooSyncStore(db);
    const policyName = `Batch Vacation ${runId}`;
    const terminated = mappedEmployee({
      firstName: "Former",
      lastName: "Employee",
      email: existing.email,
      employeeNumber: existing.employeeNumber,
      hireDate: "2020-01-15",
      originalHireDate: "2018-06-01",
      terminationDate: "2026-11-01",
      employmentStatus: "terminated",
      gender: "female",
      birthDate: "1990-12-10",
    });
    const newHire = mappedEmployee({
      firstName: "New",
      lastName: "Hire",
      email: `batch.new.${runId}@vendasta.com`,
      employeeNumber: `BN_${runId}`,
      hireDate: "2026-11-18",
      originalHireDate: "2026-11-18",
      employmentStatus: "full_time",
      gender: null,
      birthDate: null,
    });

    await store.transaction!(async (tx) => {
      const org = await tx.upsertOrgUnits("department", ["Technology"]);
      const locations = await tx.upsertOrgUnits("location", ["Saskatoon HQ"]);
      const departmentId = org.get("technology") ?? null;
      const locationId = locations.get("saskatoon hq") ?? null;

      const upserted = await tx.upsertEmployeesBatch(
        [
          {
            bambooId,
            employee: terminated,
            departmentId,
            divisionId: null,
            locationId,
          },
          {
            bambooId: newHireBambooId,
            employee: newHire,
            departmentId,
            divisionId: null,
            locationId,
          },
        ],
        { chunkSize: 50 }
      );
      expect(upserted.updated).toBe(1);
      expect(upserted.created).toBe(1);
      const newHireId = upserted.idByBambooId.get(newHireBambooId);
      expect(newHireId).toBeDefined();
      if (newHireId) employeeIds.push(newHireId);

      await tx.setManagersBatch([
        { employeeId: existing.id, managerId: manager.id },
        { employeeId: newHireId!, managerId: manager.id },
      ]);
      await tx.setUnresolvedSupervisorsBatch([
        { employeeId: existing.id, supervisorBambooId: null },
      ]);

      await tx.replaceJobHistoryMany([
        {
          employeeId: existing.id,
          rows: [
            {
              effectiveDate: "2020-01-15",
              jobTitle: "Engineer",
              departmentName: "Technology",
              locationName: "Saskatoon HQ",
            },
          ],
        },
      ]);
      await tx.replaceEmploymentStatusHistoryMany([
        {
          employeeId: existing.id,
          rows: [
            {
              effectiveDate: "2026-11-01",
              status: "terminated",
              changeType: "terminate",
              comment: "Left Vendasta",
            },
          ],
        },
      ]);
      await tx.replaceCompensationHistoryMany([
        {
          employeeId: existing.id,
          rows: [
            {
              effectiveDate: "2020-01-15",
              payRate: "90000.00",
              payType: "Salary",
              currency: "CAD",
            },
          ],
        },
      ]);
      await tx.replaceEmergencyContactsMany([
        {
          employeeId: existing.id,
          rows: [
            {
              name: "Alex Contact",
              relationship: "Spouse",
              phone: "306-555-0100",
              isPrimary: true,
            },
          ],
        },
      ]);

      const policies = await tx.upsertTimeOffPoliciesBatch([
        { name: policyName, policyType: "vacation" },
      ]);
      policyId = policies.get(policyName.toLowerCase()) ?? null;
      expect(policyId).not.toBeNull();
    });

    await store.upsertTimeOffBalancesBatch([
      { employeeId: existing.id, policyId: policyId!, sourceBalance: "10.50" },
    ]);
    const [insertedBalance] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, existing.id));
    await db.insert(timeOffBalanceAdjustments).values({
      balanceId: insertedBalance.id,
      amount: "-2.00",
      reason: "used: time-off request",
      adjustedBy: manager.id,
    });
    await store.upsertTimeOffBalancesBatch([
      { employeeId: existing.id, policyId: policyId!, sourceBalance: "12.00" },
    ]);

    const [updated] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, existing.id));
    expect(updated.employmentStatus).toBe("terminated");
    expect(updated.terminationDate).toBe("2026-11-01");
    expect(updated.hireDate).toBe("2020-01-15");
    expect(updated.originalHireDate).toBe("2018-06-01");
    expect(updated.birthDate).toBe("1990-12-10");
    expect(updated.firstName).toBe("Former");
    expect(updated.managerId).toBe(manager.id);
    expect(updated.pendingSupervisorBambooId).toBeNull();

    const [newRow] = await db
      .select()
      .from(employees)
      .where(eq(employees.bambooId, newHireBambooId));
    expect(newRow.employmentStatus).toBe("full_time");
    expect(newRow.hireDate).toBe("2026-11-18");
    expect(newRow.terminationDate).toBeNull();
    expect(newRow.gender).toBeNull();

    const jobs = await db
      .select()
      .from(jobHistory)
      .where(eq(jobHistory.employeeId, existing.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].effectiveDate).toBe("2020-01-15");

    const statuses = await db
      .select()
      .from(employmentStatusHistory)
      .where(eq(employmentStatusHistory.employeeId, existing.id));
    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe("terminated");
    expect(statuses[0].effectiveDate).toBe("2026-11-01");

    const pay = await db
      .select()
      .from(compensationHistory)
      .where(eq(compensationHistory.employeeId, existing.id));
    expect(pay).toHaveLength(1);
    expect(Number(pay[0].payRate)).toBe(90000);

    const contacts = await db
      .select()
      .from(emergencyContacts)
      .where(eq(emergencyContacts.employeeId, existing.id));
    expect(contacts).toHaveLength(1);
    expect(contacts[0].isPrimary).toBe(true);

    const [balance] = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.employeeId, existing.id));
    expect(Number(balance.sourceBalance)).toBe(12);
    expect(Number(balance.balance)).toBe(10);

    const decision = decideVendastaEmployeeAccess(
      { sub: vendastaSub },
      {
        id: updated.id,
        email: updated.email,
        vendastaSub: updated.vendastaSub,
        userId: updated.userId,
        accessLevel: updated.accessLevel,
        employmentStatus: updated.employmentStatus,
      },
      null
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("terminated");
  });
});
