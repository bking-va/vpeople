import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";
import ws from "ws";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const isNeonUrl = process.env.DATABASE_URL.includes("neon.tech");

// Configure WebSocket for Neon on Node.js/Vercel (required for serverless environments)
if (isNeonUrl && typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Use neon-serverless Pool for Neon (supports transactions via WebSocket), pg Pool for local/other
// Connection pooling is managed per-request; Pool.end() is not needed in serverless handlers
export const db = isNeonUrl
  ? drizzleNeonServerless(
      new NeonPool({
        connectionString: process.env.DATABASE_URL,
      }),
      { schema }
    )
  : drizzlePg(new PgPool({ connectionString: process.env.DATABASE_URL }), { schema });
