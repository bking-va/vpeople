import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const isNeonUrl = process.env.DATABASE_URL.includes("neon.tech");

// Use neon-serverless Pool for Neon (supports transactions), pg Pool for local/other
export const db = isNeonUrl
  ? drizzleNeonServerless(new NeonPool({ connectionString: process.env.DATABASE_URL }), { schema })
  : drizzlePg(new PgPool({ connectionString: process.env.DATABASE_URL }), { schema });
