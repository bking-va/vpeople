import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const isNeonUrl = process.env.DATABASE_URL.includes("neon.tech");

export const db = isNeonUrl
  ? drizzleNeon(neon(process.env.DATABASE_URL), { schema })
  : drizzlePg(new Pool({ connectionString: process.env.DATABASE_URL }), { schema });
