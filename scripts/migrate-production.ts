import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";
import * as fs from "fs";

async function runMigrations() {
  const DATABASE_URL = fs.readFileSync("/tmp/db_url.txt", "utf-8").trim();
  
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL not found");
  }

  console.log("Connecting to production database...");
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("✅ Migrations completed successfully");
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
