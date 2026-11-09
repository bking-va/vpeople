import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool as PgPool } from "pg";
import path from "path";

export async function runMigrations(databaseUrl: string) {
  console.log("Running database migrations...");

  const migrationsFolder = path.join(process.cwd(), "drizzle");
  console.log("Migrations folder:", migrationsFolder);

  const isNeonUrl = databaseUrl.includes("neon.tech");

  if (isNeonUrl) {
    const pool = new NeonPool({ connectionString: databaseUrl });
    try {
      await migrateNeon(drizzleNeon(pool), { migrationsFolder });
      console.log("✅ Migrations completed successfully");
    } catch (error) {
      console.error("❌ Migration failed:", error);
      throw error;
    } finally {
      await pool.end();
    }
    return;
  }

  const pool = new PgPool({ connectionString: databaseUrl });
  try {
    await migratePg(drizzlePg(pool), { migrationsFolder });
    console.log("✅ Migrations completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}
