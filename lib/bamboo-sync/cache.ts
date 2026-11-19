import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import path from "node:path";
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

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function currentUid(): number {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    throw new Error("Bamboo sync cache requires a POSIX user id");
  }
  return uid;
}

function openFlags(...flags: Array<number | undefined>): number {
  return flags.reduce<number>((all, flag) => all | (flag ?? 0), 0);
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

export async function assertSafeCacheLocation(cachePath: string): Promise<string> {
  const resolved = path.resolve(cachePath);
  const dirPath = path.dirname(resolved);
  const uid = currentUid();
  const flags = openFlags(
    fsConstants.O_RDONLY,
    fsConstants.O_DIRECTORY,
    fsConstants.O_NOFOLLOW
  );
  let handle;
  try {
    handle = await open(dirPath, flags);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT") {
      throw new Error(
        "Bamboo sync cache directory does not exist. Create it with mkdir -m 700 in a private location, not /tmp."
      );
    }
    if (code === "ELOOP" || code === "EMLINK") {
      throw new Error("Bamboo sync cache directory must not be a symlink");
    }
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isDirectory()) {
      throw new Error("Bamboo sync cache parent must be a directory");
    }
    if (stat.uid !== uid) {
      throw new Error("Bamboo sync cache directory must be owned by the current user");
    }
    if ((stat.mode & 0o077) !== 0) {
      throw new Error(
        "Bamboo sync cache directory must be mode 0700, not a shared directory such as /tmp"
      );
    }
  } finally {
    await handle.close();
  }
  return resolved;
}

async function assertSafeCacheFile(
  handle: Awaited<ReturnType<typeof open>>
): Promise<void> {
  const uid = currentUid();
  const stat = await handle.stat();
  if (!stat.isFile()) {
    throw new Error("Bamboo sync cache must be a regular file");
  }
  if (stat.uid !== uid) {
    throw new Error("Bamboo sync cache must be owned by the current user");
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error("Bamboo sync cache must be mode 0600");
  }
}

async function openCacheFile(
  cachePath: string,
  flags: number,
  mode?: number
): Promise<Awaited<ReturnType<typeof open>>> {
  const openFlagsValue = openFlags(flags, fsConstants.O_NOFOLLOW);
  try {
    return mode === undefined
      ? await open(cachePath, openFlagsValue)
      : await open(cachePath, openFlagsValue, mode);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ELOOP" || code === "EMLINK") {
      throw new Error("Bamboo sync cache must not be a symlink");
    }
    throw error;
  }
}

export async function writeBambooSyncCache(
  cachePath: string,
  snapshot: BambooSyncSnapshot
): Promise<void> {
  const resolved = await assertSafeCacheLocation(cachePath);
  try {
    const existing = await openCacheFile(resolved, fsConstants.O_RDONLY);
    try {
      await assertSafeCacheFile(existing);
    } finally {
      await existing.close();
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  }

  const tmpPath = path.join(
    path.dirname(resolved),
    `.bamboo-sync-${randomBytes(16).toString("hex")}.tmp`
  );
  const handle = await openCacheFile(
    tmpPath,
    openFlags(fsConstants.O_WRONLY, fsConstants.O_CREAT, fsConstants.O_EXCL),
    0o600
  );
  try {
    await assertSafeCacheFile(handle);
    await handle.writeFile(JSON.stringify(snapshot), "utf8");
    await handle.chmod(0o600);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
  await rename(tmpPath, resolved);
  const dest = await openCacheFile(resolved, fsConstants.O_RDONLY);
  try {
    await assertSafeCacheFile(dest);
  } finally {
    await dest.close();
  }
}

export async function bambooSyncCacheExists(cachePath: string): Promise<boolean> {
  const resolved = await assertSafeCacheLocation(cachePath);
  try {
    const handle = await openCacheFile(resolved, fsConstants.O_RDONLY);
    try {
      await assertSafeCacheFile(handle);
      return true;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function readBambooSyncCache(
  cachePath: string
): Promise<BambooSyncSnapshot> {
  const resolved = await assertSafeCacheLocation(cachePath);
  const handle = await openCacheFile(resolved, fsConstants.O_RDONLY);
  try {
    await assertSafeCacheFile(handle);
    const raw = await handle.readFile("utf8");
    return parseBambooSyncSnapshot(JSON.parse(raw));
  } finally {
    await handle.close();
  }
}
