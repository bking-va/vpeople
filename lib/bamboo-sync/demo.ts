import type { SyncEmployeeRow } from "./types";

/** Explicit emails from lib/seed.ts and scripts/seed-*.mjs. */
export const DEMO_SEED_EMAILS = [
  "brendan.king@vendasta.com",
  "jean.parchewsky@vendasta.com",
  "david.chen@vendasta.com",
  "sarah.martinez@vendasta.com",
  "michael.obrien@vendasta.com",
  "emily.thompson@vendasta.com",
  "alex.kim@vendasta.com",
] as const;

export function isDemoEmployeeNumber(employeeNumber: string | null | undefined): boolean {
  if (!employeeNumber) return false;
  return /^E0\d{2}$/.test(employeeNumber);
}

export function isDemoSeedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if ((DEMO_SEED_EMAILS as readonly string[]).includes(normalized)) return true;
  return normalized.endsWith("@example.com");
}

export function isDemoEmployee(row: Pick<SyncEmployeeRow, "bambooId" | "email" | "employeeNumber">): boolean {
  if (row.bambooId) return false;
  return isDemoEmployeeNumber(row.employeeNumber) || isDemoSeedEmail(row.email);
}

