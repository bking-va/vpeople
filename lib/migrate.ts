import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";

export async function runMigrations(databaseUrl: string) {
  console.log("Running database migrations...");
  
  try {
    const sql = neon(databaseUrl);
    const db = drizzle(sql);

    await migrate(db, { migrationsFolder: "./drizzle" });
    
    console.log("✅ Migrations completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}
