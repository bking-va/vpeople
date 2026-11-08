import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";
import path from "path";

export async function runMigrations(databaseUrl: string) {
  console.log("Running database migrations...");
  
  try {
    const sql = neon(databaseUrl);
    const db = drizzle(sql);

    const migrationsFolder = path.join(process.cwd(), "drizzle");
    console.log("Migrations folder:", migrationsFolder);

    await migrate(db, { migrationsFolder });
    
    console.log("✅ Migrations completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}
