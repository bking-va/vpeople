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

    await store.pruneImportedCustomFieldValues([], [fieldId!], { chunkSize: 50 });
    const remaining = await db
      .select()
      .from(customFieldValues)
      .where(eq(customFieldValues.entityId, employee.id));
    expect(remaining).toHaveLength(0);

    await store.pruneImportedRowsNotIn("assets", [], { chunkSize: 50 });
    await store.pruneImportedRowsNotIn("dependents", [], { chunkSize: 50 });
    expect(
      await db.select().from(employeeAssets).where(eq(employeeAssets.employeeId, employee.id))
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(employeeDependents)
        .where(eq(employeeDependents.employeeId, employee.id))
    ).toHaveLength(0);
  });

  test("incremental sync keeps a locally tightened hr_only visibility", async () => {
    const bambooId = `customNote_${runId}`;
    const store = createBambooSyncStore(db);
    const created = await store.upsertCustomFieldsBatch(
      [
        {
          bambooId,
          name: "Team Note",
          fieldType: "text",
          entityType: "employee",
          section: "personal",
          options: null,
          isRequired: false,
          orderIndex: 4,
          visibility: "manager_hr",
        },
      ],
      { chunkSize: 50 }
    );
    const noteId = created.get(bambooId);
    expect(noteId).toBeDefined();

    await db
      .update(customFields)
      .set({ visibility: "hr_only" })
      .where(eq(customFields.id, noteId!));

    await store.upsertCustomFieldsBatch(
      [
        {
          bambooId,
          name: "Team Note",
          fieldType: "text",
          entityType: "employee",
          section: "personal",
          options: null,
          isRequired: false,
          orderIndex: 4,
          visibility: "manager_hr",
        },
      ],
      { chunkSize: 50 }
    );

    const [updated] = await db
      .select({ visibility: customFields.visibility })
      .from(customFields)
      .where(eq(customFields.id, noteId!));
    expect(updated.visibility).toBe("hr_only");

    await db.delete(customFields).where(eq(customFields.id, noteId!));
  });

  test("lockdown reclassifies leftover public homeEmail copies", async () => {
    const store = createBambooSyncStore(db);
    const [owner] = await db
      .insert(employees)
      .values({
        employeeNumber: `MTHE_${runId}`,
        bambooId: `META_HOME_${runId}`,
        firstName: "Home",
        lastName: "Email",
        email: `meta.home.${runId}@vendasta.com`,
        hireDate: "2020-01-15",
        originalHireDate: "2020-01-15",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    const created = await store.upsertCustomFieldsBatch(
      [
        {
          bambooId: "homeEmail",
          name: "Home Email",
          fieldType: "text",
          entityType: "employee",
          section: "personal",
          options: null,
          isRequired: false,
          orderIndex: 1,
          visibility: "everyone",
        },
      ],
      { chunkSize: 50 }
    );
    const homeEmailId = created.get("homeEmail");
    expect(homeEmailId).toBeDefined();
    await db
      .update(customFields)
      .set({ visibility: "everyone" })
      .where(eq(customFields.id, homeEmailId!));
    await store.upsertCustomFieldValuesBatch(
      [{ customFieldId: homeEmailId!, entityId: owner.id, value: "pat@gmail.com" }],
      { chunkSize: 50 }
    );

    const listed = await store.listImportedCustomFieldDefinitions();
    expect(listed.some((row) => row.bambooId === "homeEmail")).toBe(true);
    await store.lockDownImportedCustomFields([homeEmailId!], { chunkSize: 50 });

    const [locked] = await db
      .select({ visibility: customFields.visibility })
      .from(customFields)
      .where(eq(customFields.id, homeEmailId!));
    expect(locked.visibility).toBe("hr_only");
    expect(
      await db
        .select()
        .from(customFieldValues)
        .where(eq(customFieldValues.customFieldId, homeEmailId!))
    ).toHaveLength(0);

    await db.delete(customFields).where(eq(customFields.id, homeEmailId!));
    await db.delete(employees).where(eq(employees.id, owner.id));
  });
});
