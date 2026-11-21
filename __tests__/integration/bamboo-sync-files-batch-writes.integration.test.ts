/**
 * Real Postgres coverage for PR C batched file writes with explicit CASTs.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { companyFiles, documents, employees } from "@/lib/db/schema";
import { createBambooSyncStore } from "@/lib/bamboo-sync/store";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for integration tests"
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: { employees, documents, companyFiles } });

describe("BambooHR file batched writes (Real Postgres)", () => {
  const runId = Date.now();
  const empBamboo = `FILEEMP_${runId}`;
  const docBamboo = `emp:${empBamboo}:12`;
  const companyBamboo = `company:${runId}`;
  let employeeId: number | null = null;

  afterAll(async () => {
    try {
      await db.delete(documents).where(eq(documents.bambooId, docBamboo));
      await db.delete(companyFiles).where(eq(companyFiles.bambooId, companyBamboo));
      if (employeeId) {
        await db.delete(employees).where(eq(employees.id, employeeId));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("upserts employee and company files via CASTed VALUES", async () => {
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `FL_${runId}`,
        bambooId: empBamboo,
        firstName: "File",
        lastName: "Import",
        email: `file.import.${runId}@vendasta.com`,
        hireDate: "2020-01-15",
        originalHireDate: "2020-01-15",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    employeeId = employee.id;
    const store = createBambooSyncStore(db);

    await store.upsertEmployeeDocumentsBatch(
      [
        {
          bambooId: docBamboo,
          employeeId: employee.id,
          title: "i9.pdf",
          category: "tax_form",
          bambooCategory: "I-9",
          restricted: true,
          containsCompensation: false,
          fileUrl: null,
          uploadedBy: employee.id,
        },
      ],
      { chunkSize: 50 }
    );
    await store.upsertCompanyFilesBatch(
      [
        {
          bambooId: companyBamboo,
          title: "handbook.pdf",
          category: "policy",
          bambooCategory: "Policies",
          restricted: false,
          containsCompensation: false,
          fileUrl: null,
          sizeBytes: 2048,
        },
      ],
      { chunkSize: 50 }
    );

    const [doc] = await db.select().from(documents).where(eq(documents.bambooId, docBamboo));
    expect(doc.restricted).toBe(true);
    expect(doc.status).toBe("archived");
    expect(doc.bambooCategory).toBe("I-9");
    expect((await store.listImportedFileBambooIds("employee")).has(docBamboo)).toBe(false);
    expect((await store.listImportedFileBambooIds("company")).has(companyBamboo)).toBe(false);

    await store.upsertEmployeeDocumentsBatch(
      [
        {
          bambooId: docBamboo,
          employeeId: employee.id,
          title: "i9.pdf",
          category: "tax_form",
          bambooCategory: "I-9",
          restricted: true,
          containsCompensation: false,
          fileUrl: "https://blob.vercel-storage.com/private/i9",
          uploadedBy: employee.id,
        },
      ],
      { chunkSize: 50 }
    );
    const [updated] = await db.select().from(documents).where(eq(documents.bambooId, docBamboo));
    expect(updated.fileUrl).toContain("blob.vercel-storage.com");
    expect(updated.status).toBe("archived");

    const ids = await store.listImportedFileBambooIds("employee");
    expect(ids.has(docBamboo)).toBe(true);
    expect((await store.listImportedFileBambooIds("company")).has(companyBamboo)).toBe(
      false
    );

    await store.upsertCompanyFilesBatch(
      [
        {
          bambooId: companyBamboo,
          title: "handbook.pdf",
          category: "policy",
          bambooCategory: "Policies",
          restricted: false,
          containsCompensation: false,
          fileUrl: "https://blob.vercel-storage.com/private/handbook",
          sizeBytes: 2048,
        },
      ],
      { chunkSize: 50 }
    );
    expect((await store.listImportedFileBambooIds("company")).has(companyBamboo)).toBe(
      true
    );
  });
});
