/**
 * Real Postgres coverage for PR D batched Bamboo writes: employee extras,
 * custom fields/values, assets, and dependents use VALUES + explicit CASTs.
 * SIN/SSN aliases are never stored.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  customFieldValues,
  customFields,
  employeeAssets,
  employeeDependents,
  employees,
} from "@/lib/db/schema";
import { createBambooSyncStore } from "@/lib/bamboo-sync/store";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for integration tests"
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {
  schema: {
    employees,
    customFields,
    customFieldValues,
    employeeAssets,
    employeeDependents,
  },
});

describe("BambooHR metadata batched writes (Real Postgres)", () => {
  const runId = Date.now();
  const bambooEmployeeId = `META_EMP_${runId}`;
  const fieldBambooId = `customShirtSize_${runId}`;
  const assetBambooId = `asset:${bambooEmployeeId}:9`;
  const dependentBambooId = `dep:${bambooEmployeeId}:3`;
  let employeeId: number | null = null;
  let fieldId: number | null = null;

  afterAll(async () => {
    try {
      if (employeeId) {
        await db.delete(employeeAssets).where(eq(employeeAssets.employeeId, employeeId));
        await db
          .delete(employeeDependents)
          .where(eq(employeeDependents.employeeId, employeeId));
        await db
          .delete(customFieldValues)
          .where(eq(customFieldValues.entityId, employeeId));
        await db.delete(employees).where(eq(employees.id, employeeId));
      }
      if (fieldId) {
        await db.delete(customFields).where(eq(customFields.id, fieldId));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("upserts extras/custom fields/assets/dependents via CASTed VALUES", async () => {
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `MT_${runId}`,
        bambooId: bambooEmployeeId,
        firstName: "Meta",
        lastName: "Import",
        email: `meta.import.${runId}@vendasta.com`,
        hireDate: "2020-01-15",
        originalHireDate: "2020-01-15",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    employeeId = employee.id;

    const store = createBambooSyncStore(db);
    await store.transaction!(async (tx) => {
      const extras = await tx.updateEmployeeExtrasBatch(
        [
          {
            bambooId: bambooEmployeeId,
            ethnicity: "Decline to specify",
            eeoJobCategory: "Professionals",
            payGroup: "Salaried",
            flsaExempt: true,
            standardHoursPerWeek: "40.00",
            timeTrackingEnabled: true,
          },
        ],
        { chunkSize: 50 }
      );
      expect(extras).toBe(1);

      const fields = await tx.upsertCustomFieldsBatch(
        [
          {
            bambooId: fieldBambooId,
            name: "Shirt Size",
            fieldType: "select",
            entityType: "employee",
            section: "personal",
            options: JSON.stringify(["S", "M", "L"]),
            isRequired: false,
            orderIndex: 12,
            visibility: "everyone",
          },
        ],
        { chunkSize: 50 }
      );
      fieldId = fields.get(fieldBambooId) ?? null;
      expect(fieldId).not.toBeNull();

      const values = await tx.upsertCustomFieldValuesBatch(
        [
          {
            customFieldId: fieldId!,
            entityId: employee.id,
            value: "M",
          },
        ],
        { chunkSize: 50 }
      );
      expect(values).toBe(1);

      const assets = await tx.upsertAssetsBatch(
        [
          {
            bambooId: assetBambooId,
            employeeId: employee.id,
            name: "MacBook Pro",
            category: "Laptop",
            serialNumber: "C02X",
            assignedDate: "2024-01-02",
            notes: null,
          },
        ],
        { chunkSize: 50 }
      );
      expect(assets).toBe(1);

      const dependents = await tx.upsertDependentsBatch(
        [
          {
            bambooId: dependentBambooId,
            employeeId: employee.id,
            firstName: "Sam",
            lastName: "Lee",
            relationship: "Child",
            birthDate: "2018-05-01",
          },
        ],
        { chunkSize: 50 }
      );
      expect(dependents).toBe(1);
    });

    const [updated] = await db
      .select({
        ethnicity: employees.ethnicity,
        eeoJobCategory: employees.eeoJobCategory,
        flsaExempt: employees.flsaExempt,
        payGroup: employees.payGroup,
      })
      .from(employees)
      .where(eq(employees.id, employee.id));
    expect(updated.ethnicity).toBe("Decline to specify");
    expect(updated.eeoJobCategory).toBe("Professionals");
    expect(updated.flsaExempt).toBe(true);
    expect(updated.payGroup).toBe("Salaried");

    const [asset] = await db
      .select()
      .from(employeeAssets)
      .where(eq(employeeAssets.bambooId, assetBambooId));
    expect(asset.name).toBe("MacBook Pro");
    expect(asset.serialNumber).toBe("C02X");

    const [dependent] = await db
      .select()
      .from(employeeDependents)
      .where(eq(employeeDependents.bambooId, dependentBambooId));
    expect(dependent.firstName).toBe("Sam");
    expect(JSON.stringify(dependent)).not.toMatch(/ssn|sin|bank/i);

    const [value] = await db
      .select()
      .from(customFieldValues)
      .where(eq(customFieldValues.entityId, employee.id));
    expect(value.value).toBe("M");
  });
});
