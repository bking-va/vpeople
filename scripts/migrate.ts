import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { Pool as NeonPool } from "@neondatabase/serverless";

import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool as PgPool } from "pg";

const runMigrations = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
  }

  const isNeonUrl = process.env.DATABASE_URL.includes("neon.tech");

  console.log("⏳ Running migrations...");

  const start = Date.now();

  if (isNeonUrl) {
    const pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
    const db = drizzleNeon(pool);
    await migrateNeon(db, { migrationsFolder: "drizzle" });
    await pool.end();
  } else {
    const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
    const db = drizzlePg(pool);
    await migratePg(db, { migrationsFolder: "drizzle" });
    await pool.end();
  }

  const end = Date.now();

  console.log(`✅ Migrations completed in ${end - start}ms`);

  process.exit(0);
};

runMigrations().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
