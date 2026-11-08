import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { Pool } from "@neondatabase/serverless";
import * as fs from "fs";

async function runMigrations() {
  const DATABASE_URL = fs.readFileSync("/tmp/db_url.txt", "utf-8").trim();
  
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL not found");
  }

  console.log("Connecting to production database...");
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });

  await pool.end();
  console.log("✅ Migrations completed successfully");
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
