import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { Pool } from "@neondatabase/serverless";
import path from "path";

export async function runMigrations(databaseUrl: string) {
  console.log("Running database migrations...");
  
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    const db = drizzle(pool);

    const migrationsFolder = path.join(process.cwd(), "drizzle");
    console.log("Migrations folder:", migrationsFolder);

    await migrate(db, { migrationsFolder });
    
    console.log("✅ Migrations completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}
