import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { jobTitles } from "@/lib/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema: { jobTitles } });

describe("Job Titles Integration Tests (Real Postgres)", () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    try {
      for (const id of createdIds) {
        await db.delete(jobTitles).where(eq(jobTitles.id, id));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("create, read, update, and delete a job title", async () => {
    const suffix = Date.now();
    const [created] = await db
      .insert(jobTitles)
      .values({
        title: `Staff Engineer ${suffix}`,
        department: "Technology",
        description: "Senior IC track",
      })
      .returning();
    createdIds.push(created.id);

    expect(created.title).toBe(`Staff Engineer ${suffix}`);
    expect(created.department).toBe("Technology");

    const [updated] = await db
      .update(jobTitles)
      .set({
        description: "Staff+ IC track",
        updatedAt: new Date(),
      })
      .where(eq(jobTitles.id, created.id))
      .returning();
    expect(updated.description).toBe("Staff+ IC track");

    await db.delete(jobTitles).where(eq(jobTitles.id, created.id));
    const remaining = await db
      .select()
      .from(jobTitles)
      .where(eq(jobTitles.id, created.id));
    expect(remaining.length).toBe(0);
    createdIds.pop();
  });

  test("job titles are unique", async () => {
    const suffix = Date.now();
    const title = `Unique Title ${suffix}`;
    const [created] = await db
      .insert(jobTitles)
      .values({ title, department: "Product" })
      .returning();
    createdIds.push(created.id);

    await expect(
      db.insert(jobTitles).values({ title, department: "Sales" })
    ).rejects.toThrow();
  });
});
