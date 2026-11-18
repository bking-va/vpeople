import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "@auth/core/adapters";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "./db/schema";

export const drizzleAuthAdapterTables = {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
};

export function createDrizzleAuthAdapter(
  database: Parameters<typeof DrizzleAdapter>[0]
): Adapter {
  return DrizzleAdapter(database, drizzleAuthAdapterTables);
}

export function authPersistence(enableDevAuth: boolean): {
  strategy: "jwt" | "database";
  useDrizzleAdapter: boolean;
} {
  if (enableDevAuth) {
    return { strategy: "jwt", useDrizzleAdapter: false };
  }
  return { strategy: "database", useDrizzleAdapter: true };
}
