import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/authz";
import { db } from "@/lib/db";
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
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Bamboo sync failed";
    console.error("Bamboo sync failed");
    return NextResponse.json({ error: "Bamboo sync failed", message }, { status: 500 });
  }
}
