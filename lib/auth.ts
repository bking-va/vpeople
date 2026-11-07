import NextAuth, { DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { users, employees } from "./db/schema";
import { eq } from "drizzle-orm";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      employeeId: number | null;
    } & DefaultSession["user"];
  }
}

const ENABLE_DEV_AUTH = process.env.ENABLE_DEV_AUTH === "true";

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
                    name: email.split("@")[0],
                    emailVerified: new Date(),
                    role: "employee",
                  })
                  .returning();
              }

              return {
                id: user.id,
                email: user.email!,
                name: user.name!,
                role: user.role || "employee",
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

        const [employee] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(eq(employees.email, user.email))
          .limit(1);

        token.employeeId = employee?.id || null;
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
