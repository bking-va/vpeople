import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import ws from "ws";
import * as schema from "../lib/db/schema";
import {
  formatAtsSyncSummary,
  runAtsApplicationsSync,
} from "../lib/bamboo-sync/ats-applications";
import { createVercelPrivateBlobStore } from "../lib/bamboo-sync/blob";
import {
  formatFilesSyncSummary,
  runBambooFilesSync,
} from "../lib/bamboo-sync/files-sync";
import { createBambooHrClientFromEnv } from "../lib/bamboo-sync/client";
import { parseBambooSyncArgs, readDatabaseUrl } from "../lib/bamboo-sync/cli";
import { createBambooSyncStore } from "../lib/bamboo-sync/store";
import { formatSyncSummary, runBambooSync } from "../lib/bamboo-sync/sync";

function createDb(databaseUrl: string) {
  const isNeonUrl = databaseUrl.includes("neon.tech");
  if (isNeonUrl) {
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const pool = new NeonPool({ connectionString: databaseUrl });
    return {
      db: drizzleNeon(pool, { schema }),
      end: () => pool.end(),
    };
  }
  const pool = new PgPool({ connectionString: databaseUrl });
  return {
    db: drizzlePg(pool, { schema }),
    end: () => pool.end(),
  };
}

async function main() {
  const args = parseBambooSyncArgs(process.argv.slice(2));
  const databaseUrl = readDatabaseUrl({ dbUrlFile: args.dbUrlFile });
  process.env.DATABASE_URL = databaseUrl;

  const { db, end } = createDb(databaseUrl);
  const store = createBambooSyncStore(db);
  const client = createBambooHrClientFromEnv();

  try {
    if (args.files) {
      const result = await runBambooFilesSync({
        client,
        store,
        blob: args.skipBlobs ? null : createVercelPrivateBlobStore(),
        mode: args.incremental ? "incremental" : "full",
        dryRun: args.dryRun,
        importBlobs: !args.skipBlobs,
        log: (message) => {
          console.log(message);
        },
      });
      console.log(formatFilesSyncSummary(result));
      if (result.status === "failed") {
        process.exitCode = 1;
      }
      return;
    }
    if (args.atsApplications) {
      const result = await runAtsApplicationsSync({
        client,
        store,
        blob: args.skipResumes ? null : createVercelPrivateBlobStore(),
        mode: args.incremental ? "incremental" : "full",
        dryRun: args.dryRun,
        importResumes: !args.skipResumes,
        onlyMissing: args.onlyMissing,
        requeueDetails: args.requeueDetails,
        resumeFrom: args.resumeFrom,
        backfillCommentsHistory: args.backfillCommentsHistory,
        concurrency: args.concurrency ?? undefined,
        log: (message) => {
          console.log(message);
        },
      });
      console.log(formatAtsSyncSummary(result));
      if (result.status === "failed") {
        process.exitCode = 1;
      }
      return;
    }
    const result = await runBambooSync({
      client,
      store,
      mode: args.incremental ? "incremental" : "full",
      dryRun: args.dryRun,
      replaceDemo: args.replaceDemo,
      cachePath: args.cacheFile,
      importMetadata:
        args.metadata ||
        ["1", "true", "yes"].includes(
          (process.env.BAMBOO_SYNC_METADATA || "").trim().toLowerCase()
        ),
      importCompensationTables:
        args.compTables ||
        ["1", "true", "yes"].includes(
          (process.env.BAMBOO_SYNC_COMP_TABLES || "").trim().toLowerCase()
        ),
      log: (message) => {
        console.log(message);
      },
    });
    console.log(formatSyncSummary(result));
    if (result.status === "failed") {
      process.exitCode = 1;
    }
  } finally {
    await end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Bamboo sync failed";
  console.error(message);
  process.exit(1);
});
