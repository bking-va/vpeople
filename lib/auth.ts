import NextAuth, { DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { users, employees } from "./db/schema";
import { eq } from "drizzle-orm";
import { isDevLoginEnabled } from "./authz";

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
    ...( ENABLE_DEV_AUTH
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

              // Look up employee record first to get proper role/access level
              const [employee] = await db
                .select({
                  id: employees.id,
                  userId: employees.userId,
                  firstName: employees.firstName,
                  lastName: employees.lastName,
                  preferredName: employees.preferredName,
                  accessLevel: employees.accessLevel,
                })
                .from(employees)
                .where(eq(employees.email, email))
                .limit(1);

              // Determine session role from employee access level
              // Session role can be "employee" | "manager" | "admin" | "full_admin"
              let sessionRole = "employee";
              if (employee?.accessLevel === "full_admin") {
                sessionRole = "full_admin";
              } else if (employee?.accessLevel === "global_view") {
                sessionRole = "admin";
              } else if (employee?.accessLevel === "regional_view") {
                sessionRole = "admin";
              } else if (employee?.accessLevel === "manager") {
                sessionRole = "manager";
              }

              // Map to userRoleEnum for database (only supports "employee" | "manager" | "admin")
              const dbRole: "employee" | "manager" | "admin" = 
                sessionRole === "full_admin" ? "admin" : sessionRole as "employee" | "manager" | "admin";

              let [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

              if (!user) {
                [user] = await db
                  .insert(users)
                  .values({
                    id: `dev-${Date.now()}`,
                    email,
                    name: employee?.preferredName || employee?.firstName || email.split("@")[0],
                    emailVerified: new Date(),
                    role: dbRole,
                  })
                  .returning();
              } else if (user.role !== dbRole) {
                // Update user role if employee access level changed
                await db
                  .update(users)
                  .set({ role: dbRole })
                  .where(eq(users.id, user.id));
                user.role = dbRole;
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
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: ENABLE_DEV_AUTH ? ("jwt" as const) : ("database" as const),
  },
  callbacks: {
    async signIn({ account, profile }: { account: any; profile?: any }) {
      if (account?.provider === "google") {
        const email = profile?.email;
        if (!email?.endsWith("@vendasta.com")) {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || "employee";

        // Use employeeId from user if available (from Credentials provider)
        if (user.employeeId !== undefined) {
          token.employeeId = user.employeeId;
        } else {
          // Otherwise look it up (for OAuth providers)
          const [employee] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(eq(employees.email, user.email))
            .limit(1);

          token.employeeId = employee?.id || null;
        }
      }
      return token;
    },
    async session({ session, token, user }: { session: any; token?: any; user?: any }) {
      if (session.user) {
        if (token) {
          // JWT strategy (credentials)
          session.user.id = token.id as string;
          session.user.role = (token.role as string) || "employee";
          session.user.employeeId = (token.employeeId as number) || null;
        } else if (user) {
          // Database strategy (Google OAuth)
          session.user.id = user.id;
          session.user.role = user.role || "employee";

          const [employee] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(eq(employees.userId, user.id))
            .limit(1);

          session.user.employeeId = employee?.id || null;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
} as any;

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
