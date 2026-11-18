import { readFileSync } from "fs";
import { join } from "path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";
import {
  authPersistence,
  createDrizzleAuthAdapter,
  drizzleAuthAdapterTables,
} from "@/lib/auth-adapter";

jest.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: jest.fn((_db, schema) => ({
    schema,
    getSessionAndUser: jest.fn(),
    createSession: jest.fn(),
    getUserByAccount: jest.fn(),
  })),
}));

function columnNames(table: Parameters<typeof getTableColumns>[0]) {
  const columns = getTableColumns(table);
  return {
    js: Object.keys(columns),
    sql: Object.fromEntries(
      Object.entries(columns).map(([jsName, column]) => [jsName, column.name])
    ),
    dataType: Object.fromEntries(
      Object.entries(columns).map(([jsName, column]) => [jsName, column.dataType])
    ),
  };
}

describe("Auth.js Drizzle adapter table mapping", () => {
  test("maps adapter to plural Postgres tables, not Auth.js defaults", () => {
    expect(getTableName(drizzleAuthAdapterTables.usersTable)).toBe("users");
    expect(getTableName(drizzleAuthAdapterTables.accountsTable)).toBe("accounts");
    expect(getTableName(drizzleAuthAdapterTables.sessionsTable)).toBe("sessions");
    expect(
      getTableName(drizzleAuthAdapterTables.verificationTokensTable)
    ).toBe("verification_tokens");

    expect(drizzleAuthAdapterTables.usersTable).toBe(users);
    expect(drizzleAuthAdapterTables.accountsTable).toBe(accounts);
    expect(drizzleAuthAdapterTables.sessionsTable).toBe(sessions);
    expect(drizzleAuthAdapterTables.verificationTokensTable).toBe(
      verificationTokens
    );
  });

  test("users columns match Auth.js postgres adapter (JS keys + SQL names + Date timestamps)", () => {
    const { js, sql, dataType } = columnNames(users);
    expect(js).toEqual(
      expect.arrayContaining(["id", "name", "email", "emailVerified", "image"])
    );
    expect(sql.id).toBe("id");
    expect(sql.name).toBe("name");
    expect(sql.email).toBe("email");
    expect(sql.emailVerified).toBe("email_verified");
    expect(sql.image).toBe("image");
    expect(dataType.emailVerified).toBe("date");
  });

  test("accounts columns match Auth.js postgres adapter", () => {
    const { js, sql } = columnNames(accounts);
    expect(js).toEqual(
      expect.arrayContaining([
        "userId",
        "type",
        "provider",
        "providerAccountId",
        "refresh_token",
        "access_token",
        "expires_at",
        "token_type",
        "scope",
        "id_token",
        "session_state",
      ])
    );
    expect(sql.userId).toBe("user_id");
    expect(sql.providerAccountId).toBe("provider_account_id");
    expect(sql.refresh_token).toBe("refresh_token");
    expect(sql.access_token).toBe("access_token");
    expect(sql.expires_at).toBe("expires_at");
    expect(sql.token_type).toBe("token_type");
    expect(sql.scope).toBe("scope");
    expect(sql.id_token).toBe("id_token");
    expect(sql.session_state).toBe("session_state");
  });

  test("sessions columns match Auth.js postgres adapter", () => {
    const { js, sql, dataType } = columnNames(sessions);
    expect(js).toEqual(
      expect.arrayContaining(["sessionToken", "userId", "expires"])
    );
    expect(sql.sessionToken).toBe("session_token");
    expect(sql.userId).toBe("user_id");
    expect(sql.expires).toBe("expires");
    expect(dataType.expires).toBe("date");
  });

  test("verification tokens columns match Auth.js postgres adapter", () => {
    const { js, sql, dataType } = columnNames(verificationTokens);
    expect(js).toEqual(
      expect.arrayContaining(["identifier", "token", "expires"])
    );
    expect(sql.identifier).toBe("identifier");
    expect(sql.token).toBe("token");
    expect(sql.expires).toBe("expires");
    expect(dataType.expires).toBe("date");
  });

  test("createDrizzleAuthAdapter passes mapped tables into DrizzleAdapter", () => {
    const fakeDb = { _: "db" };
    createDrizzleAuthAdapter(fakeDb as never);
    expect(DrizzleAdapter).toHaveBeenCalledWith(
      fakeDb,
      drizzleAuthAdapterTables
    );
  });

  test("lib/auth.ts does not use default Auth.js user/session table names", () => {
    const source = readFileSync(join(process.cwd(), "lib/auth.ts"), "utf8");
    expect(source).not.toMatch(/DrizzleAdapter\(\s*db\s*\)/);
    expect(source).toMatch(/createDrizzleAuthAdapter\(\s*db\s*\)/);
    expect(source).toMatch(/authPersistence\(ENABLE_DEV_AUTH\)/);
    expect(source).toMatch(/allowDangerousEmailAccountLinking:\s*false/);
  });

  test("keeps database sessions when dev auth is off, jwt only for dev login", () => {
    expect(authPersistence(false)).toEqual({
      strategy: "database",
      useDrizzleAdapter: true,
    });
    expect(authPersistence(true)).toEqual({
      strategy: "jwt",
      useDrizzleAdapter: false,
    });
  });
});
