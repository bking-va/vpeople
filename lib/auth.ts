import NextAuth, { DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { users, employees } from "./db/schema";
import { eq } from "drizzle-orm";
import {
  devLoginSessionRole,
  isDevLoginEnabled,
  sessionRoleFromAccessLevel,
} from "./authz";
import {
  linkVendastaEmployee,
  resolveVendastaEmployee,
} from "./vendasta-identity";
import {
  VENDASTA_PROVIDER_ID,
  isVendastaOidcConfigured,
  vendastaOidcProvider,
  type VendastaIdTokenClaims,
} from "./vendasta-oidc";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      employeeId: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    employeeId?: number | null;
  }
}

const ENABLE_DEV_AUTH = isDevLoginEnabled();

const authConfig = {
  trustHost: true,
  adapter: ENABLE_DEV_AUTH ? undefined : DrizzleAdapter(db),
  providers: [
    ...(isVendastaOidcConfigured()
      ? [
          vendastaOidcProvider({
            clientId: process.env.AUTH_VENDASTA_ID!,
            clientSecret: process.env.AUTH_VENDASTA_SECRET!,
          }),
        ]
      : []),
    ...(ENABLE_DEV_AUTH
      ? [
          Credentials({
            id: "credentials",
            name: "Dev Login",
            credentials: {
              email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
              if (!credentials?.email) {
                return null;
              }

              const email = credentials.email as string;
              if (!email.endsWith("@vendasta.com")) {
                return null;
              }

              const [employee] = await db
                .select()
                .from(employees)
                .where(eq(employees.email, email))
                .limit(1);

              const sessionRole = devLoginSessionRole(employee?.accessLevel);

              let [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

              if (!user) {
                const [newUser] = await db
                  .insert(users)
                  .values({
                    id: crypto.randomUUID(),
                    email,
                    name: employee
                      ? `${employee.firstName} ${employee.lastName}`
                      : email.split("@")[0],
                    role:
                      sessionRole === "full_admin" ? "admin" : sessionRole,
                  })
                  .returning();
                user = newUser;
              } else {
                const dbRole =
                  sessionRole === "full_admin" ? "admin" : sessionRole;
                if (dbRole === "employee" && user.role !== "employee") {
                  await db
                    .update(users)
                    .set({ role: "employee" })
                    .where(eq(users.id, user.id));
                  user.role = "employee";
                } else if (user.role !== dbRole) {
                  await db
                    .update(users)
                    .set({ role: dbRole })
                    .where(eq(users.id, user.id));
                  user.role = dbRole;
                }
              }

              return {
                id: user.id,
                email: user.email!,
                name: employee?.preferredName
                  ? `${employee.preferredName} ${employee.lastName}`
                  : employee
                    ? `${employee.firstName} ${employee.lastName}`
                    : user.name!,
                role: sessionRole,
                employeeId: employee?.id || null,
              };
            },
          }),
        ]
      : []),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  session: {
    strategy: ENABLE_DEV_AUTH ? ("jwt" as const) : ("database" as const),
  },
  callbacks: {
    async signIn({
      account,
      profile,
    }: {
      account: any;
      profile?: VendastaIdTokenClaims;
    }) {
      if (account?.provider === VENDASTA_PROVIDER_ID) {
        const decision = await resolveVendastaEmployee(profile);
        return decision.ok;
      }
      // Vendasta OIDC is the SSO path. Do not authorize Google by email suffix.
      if (account?.provider === "google") {
        return false;
      }
      return true;
    },
    async jwt({
      token,
      user,
      account,
      profile,
    }: {
      token: any;
      user: any;
      account?: any;
      profile?: VendastaIdTokenClaims;
    }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || "employee";

        if (account?.provider === VENDASTA_PROVIDER_ID) {
          const sub =
            typeof profile?.sub === "string"
              ? profile.sub.trim()
              : account.providerAccountId;
          await linkVendastaEmployee(user.id, profile);
          const [employee] = await db
            .select({
              id: employees.id,
              email: employees.email,
              accessLevel: employees.accessLevel,
            })
            .from(employees)
            .where(eq(employees.vendastaSub, sub))
            .limit(1);
          token.employeeId = employee?.id ?? null;
          token.role = sessionRoleFromAccessLevel(employee?.accessLevel);
          if (employee?.email) token.email = employee.email;
          return token;
        }

        if (user.employeeId !== undefined) {
          token.employeeId = user.employeeId;
        } else {
          token.employeeId = null;
        }
      }
      return token;
    },
    async session({
      session,
      token,
      user,
    }: {
      session: any;
      token?: any;
      user?: any;
    }) {
      if (session.user) {
        if (token) {
          session.user.id = token.id as string;
          session.user.role = (token.role as string) || "employee";
          session.user.employeeId = (token.employeeId as number) || null;
          if (typeof token.email === "string" && token.email) {
            session.user.email = token.email;
          }
        } else if (user) {
          session.user.id = user.id;

          const [employee] = await db
            .select({
              id: employees.id,
              email: employees.email,
              accessLevel: employees.accessLevel,
            })
            .from(employees)
            .where(eq(employees.userId, user.id))
            .limit(1);

          session.user.employeeId = employee?.id || null;
          session.user.role = employee
            ? sessionRoleFromAccessLevel(employee.accessLevel)
            : "employee";
          if (employee?.email) {
            session.user.email = employee.email;
          }
        }
      }
      return session;
    },
  },
  events: {
    async signIn({
      user,
      account,
      profile,
    }: {
      user: { id?: string };
      account: { provider?: string } | null;
      profile?: VendastaIdTokenClaims;
    }) {
      if (account?.provider !== VENDASTA_PROVIDER_ID || !user.id) return;
      await linkVendastaEmployee(user.id, profile);
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
} as any;

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
