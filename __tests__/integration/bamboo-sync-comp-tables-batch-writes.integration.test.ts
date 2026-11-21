/**
 * Real Postgres coverage for PR E batched Bamboo writes: custom compensation
 * tables use VALUES + explicit CASTs, including jsonb, and never store SIN/SSN.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employeeCompensationTableRows,
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
  schema: { employees, employeeCompensationTableRows },
});

describe("BambooHR compensation table batched writes (Real Postgres)", () => {
  const runId = Date.now();
  const bambooEmployeeId = `COMP_EMP_${runId}`;
  const rowBambooId = `ct:customAnnualBonus:${bambooEmployeeId}:22`;
  let employeeId: number | null = null;

  afterAll(async () => {
    try {
      await db
        .delete(employeeCompensationTableRows)
        .where(eq(employeeCompensationTableRows.bambooId, rowBambooId));
      if (employeeId) {
        await db.delete(employees).where(eq(employees.id, employeeId));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("upserts compensation table rows via CASTed VALUES including jsonb", async () => {
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `CT_${runId}`,
        bambooId: bambooEmployeeId,
        firstName: "Comp",
        lastName: "Import",
        email: `comp.import.${runId}@vendasta.com`,
        hireDate: "2020-01-15",
        originalHireDate: "2020-01-15",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    employeeId = employee.id;

    const store = createBambooSyncStore(db);
    await store.transaction!(async (tx) => {
      const count = await tx.upsertCompensationTableRowsBatch(
        [
          {
            bambooId: rowBambooId,
            employeeId: employee.id,
            tableAlias: "customAnnualBonus",
            rowData: { id: "22", amount: "2500", currency: "CAD" },
          },
        ],
        { chunkSize: 50 }
      );
      expect(count).toBe(1);
    });

    const [row] = await db
      .select()
      .from(employeeCompensationTableRows)
      .where(eq(employeeCompensationTableRows.bambooId, rowBambooId));
    expect(row.tableAlias).toBe("customAnnualBonus");
    expect(row.rowData).toEqual({ id: "22", amount: "2500", currency: "CAD" });
    expect(JSON.stringify(row)).not.toMatch(/ssn|sin|bank/i);
  });
});
