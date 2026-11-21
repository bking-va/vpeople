import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/authz";
import { db } from "@/lib/db";
import { runAtsApplicationsSync } from "@/lib/bamboo-sync/ats-applications";
import { createBambooHrClientFromEnv } from "@/lib/bamboo-sync/client";
import { createBambooSyncStore } from "@/lib/bamboo-sync/store";
import { runBambooSync } from "@/lib/bamboo-sync/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isCronAuthorized(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const store = createBambooSyncStore(db);
    const client = createBambooHrClientFromEnv();
    const result = await runBambooSync({
      client,
      store,
      mode: "incremental",
      // Files, metadata, and compensation-table imports are operator CLI/env
      // only. Do not pass importMetadata here.
      log: (message) => {
        console.log(message);
      },
    });
    const ats = await runAtsApplicationsSync({
      client,
      store,
      blob: null,
      mode: "incremental",
      importResumes: false,
      maxListPages: 20,
      maxMs: 90_000,
      log: (message) => {
        console.log(message);
      },
    });
    return NextResponse.json({
      status: result.status,
      fetched: result.fetched,
      created: result.created,
      updated: result.updated,
      reportsToResolved: result.reportsToResolved,
      bambooIds: result.bambooIds,
      unmappedFields: result.unmappedFields,
      datasetCounts: result.datasetCounts,
      atsApplications: {
        status: ats.status,
        datasetCounts: ats.datasetCounts,
        phase: ats.checkpoint.phase,
      },
    });
  } catch {
    console.error("Bamboo sync failed");
    return NextResponse.json({ error: "Bamboo sync failed" }, { status: 500 });
  }
}
