import { access, chmod, readFile, rename, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { BambooEmployeeRecord, BambooSyncMode } from "./types";

export const BAMBOO_SYNC_CACHE_VERSION = 1;

export type BambooSyncTableSnapshot = {
  jobInfo: Record<string, Array<Record<string, unknown>>>;
  employmentStatus: Record<string, Array<Record<string, unknown>>>;
  compensation: Record<string, Array<Record<string, unknown>>>;
  emergencyContacts: Record<string, Array<Record<string, unknown>>> | null;
};

export type BambooSyncSnapshot = {
  version: number;
  mode: BambooSyncMode;
  fetchedAt: string;
  employees: BambooEmployeeRecord[];
  latestChanged: string | null;
  deletedBambooIds: string[];
  tables: BambooSyncTableSnapshot;
  timeOffTypes: Array<{ id: string; name: string; units?: string }>;
  balances: Record<string, Array<{ name: string; balance: string }>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBambooSyncSnapshot(value: unknown): BambooSyncSnapshot {
  if (!isRecord(value) || value.version !== BAMBOO_SYNC_CACHE_VERSION) {
    throw new Error("Bamboo sync cache is invalid or unsupported");
  }
  if (
    !Array.isArray(value.employees) ||
    !isRecord(value.tables) ||
    !isRecord(value.balances)
  ) {
    throw new Error("Bamboo sync cache is invalid or unsupported");
  }
  if (value.mode !== "full" && value.mode !== "incremental") {
    throw new Error("Bamboo sync cache is invalid or unsupported");
  }
  return value as unknown as BambooSyncSnapshot;
}

export async function writeBambooSyncCache(
  cachePath: string,
  snapshot: BambooSyncSnapshot
): Promise<void> {
  const tmpPath = `${cachePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(snapshot), { mode: 0o600 });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, cachePath);
  await chmod(cachePath, 0o600);
}

export async function bambooSyncCacheExists(cachePath: string): Promise<boolean> {
  try {
    await access(cachePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readBambooSyncCache(
  cachePath: string
): Promise<BambooSyncSnapshot> {
  const raw = await readFile(cachePath, "utf8");
  return parseBambooSyncSnapshot(JSON.parse(raw));
}
