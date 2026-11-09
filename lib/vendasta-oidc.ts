import type { OIDCConfig } from "@auth/core/providers";
import { isVendastaWorkEmail, sessionRoleFromAccessLevel } from "@/lib/authz";

export const VENDASTA_PROVIDER_ID = "vendasta";

export const VENDASTA_OIDC_ISSUER = "https://iam-prod.apigateway.co";
export const VENDASTA_OIDC_WELL_KNOWN =
  "https://iam-prod.apigateway.co/.well-known/openid-configuration";
export const VENDASTA_OIDC_AUTHORIZATION =
  "https://sso-api-prod.apigateway.co/oauth2/auth";
export const VENDASTA_OIDC_TOKEN =
  "https://sso-api-prod.apigateway.co/oauth2/token";
export const VENDASTA_OIDC_USERINFO =
  "https://sso-api-prod.apigateway.co/oauth2/user-info";
export const VENDASTA_OIDC_JWKS =
  "https://iam-prod.apigateway.co/oauth2/v1/certs";
export const VENDASTA_OIDC_END_SESSION =
  "https://sso-api-prod.apigateway.co/oauth2/logout";

/** Discovery scopes_supported is openid,profile. email exists but is restricted. */
export const VENDASTA_OIDC_SCOPES = "openid profile";

export const VENDASTA_ENTRY_PATH = "/auth/vendasta";
export const VENDASTA_CALLBACK_PATH = "/api/auth/callback/vendasta";
export const VENDASTA_LOGOUT_PATH = "/auth/logout";
export const VENDASTA_LEGACY_SESSION_PATH = "/api/auth/vendasta/legacy-session";

/**
 * Vendasta internal partner namespace (pid), not an AG/account_id and not a
 * user-selected tenant. Injected on authorize only when AUTH_VENDASTA_PARTNER_ID
 * is set to this value. Leave the env unset unless IAM requires it.
 */
export const VENDASTA_INTERNAL_PARTNER_ID = "vuni";

export const LEGACY_SESSION_DISABLED = {
  error: "legacy_session_transfer_disabled",
  message:
    "vPeople uses OpenID Connect authorization-code + PKCE. This URL does not accept legacy session JWTs.",
  entryUrl: VENDASTA_ENTRY_PATH,
} as const;

export function vendastaLegacySessionResponse(): {
  status: 410;
  body: typeof LEGACY_SESSION_DISABLED;
} {
  return { status: 410, body: LEGACY_SESSION_DISABLED };
}

export type VendastaIdTokenClaims = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  roles?: unknown;
  [key: string]: unknown;
};

export type EmployeeIdentityRow = {
  id: number;
  email: string;
  vendastaSub: string | null;
  userId: string | null;
  accessLevel: string;
  employmentStatus: string;
};

export type VendastaAccessDecision =
  | {
      ok: true;
      employeeId: number;
      bindSub: boolean;
      sessionRole: "employee" | "manager" | "admin" | "full_admin";
    }
  | {
      ok: false;
      reason: "invalid_sub" | "no_employee" | "terminated" | "sub_mismatch";
    };

export function isVendastaOidcConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env.AUTH_VENDASTA_ID?.trim() && env.AUTH_VENDASTA_SECRET?.trim());
}

/**
 * Server-side partner namespace only. Query/form `partner_id` is ignored.
 * Returns `vuni` when AUTH_VENDASTA_PARTNER_ID=vuni; otherwise undefined.
 */
export function vendastaPartnerIdFromEnv(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const raw = env.AUTH_VENDASTA_PARTNER_ID?.trim().toLowerCase();
  if (raw === VENDASTA_INTERNAL_PARTNER_ID) {
    return VENDASTA_INTERNAL_PARTNER_ID;
  }
  return undefined;
}

export function vendastaAuthorizeParams(
  env: Record<string, string | undefined> = process.env
): Record<string, string> {
  const params: Record<string, string> = {
    scope: VENDASTA_OIDC_SCOPES,
    response_type: "code",
  };
  const partnerId = vendastaPartnerIdFromEnv(env);
  if (partnerId) params.partner_id = partnerId;
  return params;
}

export function isVendastaSubject(sub: unknown): sub is string {
  if (typeof sub !== "string") return false;
  const value = sub.trim();
  if (value.length < 8 || value.length > 128) return false;
  if (value.includes("@")) return false;
  return /^U-[A-Za-z0-9_-]+$/.test(value);
}

/** Auth.js users.email is required/unique. Never a real mailbox. */
export function placeholderEmailForSub(sub: string): string {
  const id = sub.trim().toLowerCase();
  return `${id}@users.invalid`;
}

/**
 * Only a cryptographically verified work email from the ID token.
 * Unverified addresses, personal mailboxes, and suffix-only checks are rejected.
 */
export function verifiedWorkEmailFromIdToken(
  claims: VendastaIdTokenClaims
): string | null {
  if (claims.email_verified !== true) return null;
  if (typeof claims.email !== "string") return null;
  const email = claims.email.trim().toLowerCase();
  if (!isVendastaWorkEmail(email)) return null;
  return email;
}

export function decideVendastaEmployeeAccess(
  claims: VendastaIdTokenClaims,
  employeeBySub: EmployeeIdentityRow | null,
  employeeByVerifiedWorkEmail: EmployeeIdentityRow | null
): VendastaAccessDecision {
  if (!isVendastaSubject(claims.sub)) {
    return { ok: false, reason: "invalid_sub" };
  }
  const sub = claims.sub.trim();

  if (employeeBySub) {
    if (employeeBySub.employmentStatus === "terminated") {
      return { ok: false, reason: "terminated" };
    }
    return {
      ok: true,
      employeeId: employeeBySub.id,
      bindSub: false,
      sessionRole: sessionRoleFromAccessLevel(employeeBySub.accessLevel),
    };
  }

  const verifiedWorkEmail = verifiedWorkEmailFromIdToken(claims);
  if (!verifiedWorkEmail || !employeeByVerifiedWorkEmail) {
    return { ok: false, reason: "no_employee" };
  }

  if (
    employeeByVerifiedWorkEmail.vendastaSub &&
    employeeByVerifiedWorkEmail.vendastaSub !== sub
  ) {
    return { ok: false, reason: "sub_mismatch" };
  }

  if (employeeByVerifiedWorkEmail.employmentStatus === "terminated") {
    return { ok: false, reason: "terminated" };
  }

  return {
    ok: true,
    employeeId: employeeByVerifiedWorkEmail.id,
    bindSub: employeeByVerifiedWorkEmail.vendastaSub !== sub,
    sessionRole: sessionRoleFromAccessLevel(
      employeeByVerifiedWorkEmail.accessLevel
    ),
  };
}

export function isSafeInternalPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return false;
  }
  if (/[\s\\]/.test(value) || value.includes("://")) return false;
  try {
    const resolved = new URL(value, "https://vpeople.invalid");
    return (
      resolved.origin === "https://vpeople.invalid" &&
      !resolved.username &&
      !resolved.password
    );
  } catch {
    return false;
  }
}

export function parseVendastaEntrySearchParams(searchParams: URLSearchParams): {
  callbackUrl: string;
  authorizationParams: Record<string, string>;
} {
  const accountId = searchParams.get("account_id")?.trim() ?? "";
  const nextUrl =
    searchParams.get("nextUrl") ?? searchParams.get("callbackUrl") ?? "";
  const authorizationParams: Record<string, string> = {};
  if (accountId && /^[A-Za-z0-9_-]+$/.test(accountId)) {
    authorizationParams.account_id = accountId;
  }
  return {
    callbackUrl: isSafeInternalPath(nextUrl) ? nextUrl : "/people",
    authorizationParams,
  };
}

/** Merge IAM-injected account_id (if any) with server-side partner_id (if configured). */
export function vendastaSignInAuthorizationParams(
  entryParams: Record<string, string>,
  env: Record<string, string | undefined> = process.env
): Record<string, string> {
  const authorizationParams = { ...entryParams };
  delete authorizationParams.partner_id;
  const partnerId = vendastaPartnerIdFromEnv(env);
  if (partnerId) authorizationParams.partner_id = partnerId;
  return authorizationParams;
}

export function vendastaRegistrationUrls(appOrigin: string): {
  entryUrl: string;
  redirectUri: string;
  logoutUrl: string;
  sessionUrl: string;
} {
  const origin = appOrigin.replace(/\/$/, "");
  return {
    entryUrl: `${origin}${VENDASTA_ENTRY_PATH}`,
    redirectUri: `${origin}${VENDASTA_CALLBACK_PATH}`,
    logoutUrl: `${origin}${VENDASTA_LOGOUT_PATH}`,
    sessionUrl: `${origin}${VENDASTA_LEGACY_SESSION_PATH}`,
  };
}

export function vendastaOidcProvider(options: {
  clientId: string;
  clientSecret: string;
  env?: Record<string, string | undefined>;
}): OIDCConfig<VendastaIdTokenClaims> {
  return {
    id: VENDASTA_PROVIDER_ID,
    name: "Vendasta",
    type: "oidc",
    issuer: VENDASTA_OIDC_ISSUER,
    wellKnown: VENDASTA_OIDC_WELL_KNOWN,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorization: {
      url: VENDASTA_OIDC_AUTHORIZATION,
      params: vendastaAuthorizeParams(options.env),
    },
    token: VENDASTA_OIDC_TOKEN,
    userinfo: VENDASTA_OIDC_USERINFO,
    checks: ["pkce", "state", "nonce"],
    client: {
      token_endpoint_auth_method: "client_secret_basic",
      id_token_signed_response_alg: "RS256",
    },
    idToken: true,
    allowDangerousEmailAccountLinking: false,
    profile(profile) {
      const sub = isVendastaSubject(profile.sub) ? profile.sub.trim() : "";
      const name =
        typeof profile.name === "string" && profile.name.trim()
          ? profile.name.trim()
          : "Vendasta user";
      return {
        id: sub,
        name,
        email: placeholderEmailForSub(sub || "unknown"),
        image: null,
        role: "employee",
      };
    },
  };
}
