import { sessionRoleFromAccessLevel } from "@/lib/authz";
import {
  LEGACY_SESSION_DISABLED,
  VENDASTA_CALLBACK_PATH,
  VENDASTA_ENTRY_PATH,
  VENDASTA_LEGACY_SESSION_PATH,
  VENDASTA_OIDC_AUTHORIZATION,
  VENDASTA_OIDC_ISSUER,
  VENDASTA_OIDC_SCOPES,
  VENDASTA_OIDC_TOKEN,
  VENDASTA_OIDC_USERINFO,
  VENDASTA_OIDC_WELL_KNOWN,
  VENDASTA_PROVIDER_ID,
  decideVendastaEmployeeAccess,
  isSafeInternalPath,
  isVendastaOidcConfigured,
  isVendastaSubject,
  parseVendastaEntrySearchParams,
  placeholderEmailForSub,
  vendastaLegacySessionResponse,
  vendastaOidcProvider,
  vendastaRegistrationUrls,
  verifiedWorkEmailFromIdToken,
  type EmployeeIdentityRow,
} from "@/lib/vendasta-oidc";

const SUB = "U-e7851c53-8a49-4c89-90fd-7a8140888c02";

function employee(
  overrides: Partial<EmployeeIdentityRow> = {}
): EmployeeIdentityRow {
  return {
    id: 42,
    email: "amy@vendasta.com",
    vendastaSub: SUB,
    userId: "user-1",
    accessLevel: "employee",
    employmentStatus: "full_time",
    ...overrides,
  };
}

describe("Vendasta OIDC provider", () => {
  test("uses dedicated provider id vendasta and official discovery endpoints", () => {
    const provider = vendastaOidcProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    expect(provider.id).toBe(VENDASTA_PROVIDER_ID);
    expect(provider.id).toBe("vendasta");
    expect(provider.type).toBe("oidc");
    expect(provider.issuer).toBe(VENDASTA_OIDC_ISSUER);
    expect(provider.wellKnown).toBe(VENDASTA_OIDC_WELL_KNOWN);
    expect(provider.token).toBe(VENDASTA_OIDC_TOKEN);
    expect(provider.userinfo).toBe(VENDASTA_OIDC_USERINFO);
    expect(provider.authorization).toEqual(
      expect.objectContaining({
        url: VENDASTA_OIDC_AUTHORIZATION,
        params: expect.objectContaining({
          scope: VENDASTA_OIDC_SCOPES,
          response_type: "code",
        }),
      })
    );
    expect(VENDASTA_OIDC_SCOPES).toBe("openid profile");
    expect(VENDASTA_OIDC_SCOPES.split(" ")).not.toContain("email");
    expect(provider.checks).toEqual(["pkce", "state", "nonce"]);
    expect(provider.client).toEqual(
      expect.objectContaining({
        token_endpoint_auth_method: "client_secret_basic",
        id_token_signed_response_alg: "RS256",
      })
    );
    expect(provider.idToken).toBe(true);
    expect(provider.allowDangerousEmailAccountLinking).toBe(false);
  });

  test("profile maps stable sub and never stores a real mailbox", async () => {
    const provider = vendastaOidcProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const user = await Promise.resolve(
      provider.profile!(
        {
          sub: SUB,
          name: "Jane Doe",
          email: "jane.personal@gmail.com",
          email_verified: false,
          roles: ["partner", "smb"],
        },
        {}
      )
    );

    expect(user.id).toBe(SUB);
    expect(user.email).toBe(placeholderEmailForSub(SUB));
    expect(user.email).toBe(`${SUB.toLowerCase()}@users.invalid`);
    expect(user.email).not.toContain("gmail.com");
    expect(user.name).toBe("Jane Doe");
    expect(user.role).toBe("employee");
  });

  test("callback path is /api/auth/callback/vendasta", () => {
    expect(VENDASTA_CALLBACK_PATH).toBe("/api/auth/callback/vendasta");
    expect(
      vendastaRegistrationUrls("https://vpeople.example.com").redirectUri
    ).toBe("https://vpeople.example.com/api/auth/callback/vendasta");
  });
});

describe("Vendasta identity mapping", () => {
  test("accepts Vendasta U- subjects and rejects emails used as sub", () => {
    expect(isVendastaSubject(SUB)).toBe(true);
    expect(isVendastaSubject("amy@vendasta.com")).toBe(false);
    expect(isVendastaSubject("")).toBe(false);
    expect(isVendastaSubject("U-short")).toBe(false);
  });

  test("does not treat unverified or personal email as identity", () => {
    expect(
      verifiedWorkEmailFromIdToken({
        email: "amy@vendasta.com",
        email_verified: false,
      })
    ).toBeNull();
    expect(
      verifiedWorkEmailFromIdToken({
        email: "amy@gmail.com",
        email_verified: true,
      })
    ).toBeNull();
    expect(
      verifiedWorkEmailFromIdToken({
        email: "amy@vendasta.com",
      })
    ).toBeNull();
    expect(
      verifiedWorkEmailFromIdToken({
        email: "amy@vendasta.com",
        email_verified: true,
      })
    ).toBe("amy@vendasta.com");
  });

  test("authorizes a pre-bound vendastaSub and ignores IdP roles", () => {
    const decision = decideVendastaEmployeeAccess(
      { sub: SUB, roles: ["partner", "smb"] },
      employee({ accessLevel: "employee" }),
      null
    );
    expect(decision).toEqual({
      ok: true,
      employeeId: 42,
      bindSub: false,
      sessionRole: "employee",
    });
  });

  test("binds a first login only with verified work email matching an existing employee", () => {
    const decision = decideVendastaEmployeeAccess(
      {
        sub: SUB,
        email: "amy@vendasta.com",
        email_verified: true,
        roles: ["partner"],
      },
      null,
      employee({ vendastaSub: null, accessLevel: "manager" })
    );
    expect(decision).toEqual({
      ok: true,
      employeeId: 42,
      bindSub: true,
      sessionRole: "manager",
    });
  });

  test("suffix-only or unverified email does not authorize a new employee", () => {
    const unverified = decideVendastaEmployeeAccess(
      {
        sub: SUB,
        email: "amy@vendasta.com",
        email_verified: false,
      },
      null,
      employee({ vendastaSub: null })
    );
    expect(unverified.ok).toBe(false);
    if (!unverified.ok) expect(unverified.reason).toBe("no_employee");

    const noRow = decideVendastaEmployeeAccess(
      {
        sub: SUB,
        email: "amy@vendasta.com",
        email_verified: true,
      },
      null,
      null
    );
    expect(noRow.ok).toBe(false);
  });

  test("does not bind when the work email already belongs to a different sub", () => {
    const decision = decideVendastaEmployeeAccess(
      {
        sub: SUB,
        email: "amy@vendasta.com",
        email_verified: true,
      },
      null,
      employee({ vendastaSub: "U-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("sub_mismatch");
  });

  test("terminated employees are denied", () => {
    const decision = decideVendastaEmployeeAccess(
      { sub: SUB },
      employee({ employmentStatus: "terminated", accessLevel: "full_admin" }),
      null
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("terminated");
  });

  test("session role comes from accessLevel, never from claims", () => {
    expect(sessionRoleFromAccessLevel("employee")).toBe("employee");
    expect(sessionRoleFromAccessLevel("manager")).toBe("manager");
    expect(sessionRoleFromAccessLevel("full_admin")).toBe("admin");
    expect(sessionRoleFromAccessLevel("global_view")).toBe("admin");
    expect(sessionRoleFromAccessLevel("partner")).toBe("employee");
  });
});

describe("Vendasta SSO entry URL", () => {
  test("GET /api/auth/signin/vendasta is not the registered Entry Url", () => {
    expect(VENDASTA_ENTRY_PATH).toBe("/auth/vendasta");
    expect(VENDASTA_ENTRY_PATH).not.toBe("/api/auth/signin/vendasta");
    expect(VENDASTA_ENTRY_PATH).not.toBe("/api/auth/callback/vendasta");
  });

  test("parses account_id for the authorization request and keeps nextUrl internal", () => {
    const parsed = parseVendastaEntrySearchParams(
      new URLSearchParams({
        account_id: "AG-123",
        nextUrl: "/people/1",
      })
    );
    expect(parsed.authorizationParams).toEqual({ account_id: "AG-123" });
    expect(parsed.callbackUrl).toBe("/people/1");
  });

  test("drops unsafe nextUrl and malformed account_id", () => {
    expect(isSafeInternalPath("https://evil.example/phish")).toBe(false);
    expect(isSafeInternalPath("//evil.example")).toBe(false);
    expect(isSafeInternalPath("/\\evil.example")).toBe(false);
    expect(isSafeInternalPath("/people\n/evil")).toBe(false);
    const parsed = parseVendastaEntrySearchParams(
      new URLSearchParams({
        account_id: "AG-123&inject=1",
        nextUrl: "https://evil.example",
      })
    );
    expect(parsed.authorizationParams).toEqual({});
    expect(parsed.callbackUrl).toBe("/people");
  });

  test("registration URLs keep callback distinct from the legacy session POST", () => {
    const urls = vendastaRegistrationUrls("https://vpeople.example.com/");
    expect(urls.entryUrl).toBe(
      "https://vpeople.example.com/auth/vendasta?account_id={account_id}"
    );
    expect(urls.redirectUri).toBe(
      "https://vpeople.example.com/api/auth/callback/vendasta"
    );
    expect(urls.sessionUrl).toBe(
      `https://vpeople.example.com${VENDASTA_LEGACY_SESSION_PATH}`
    );
    expect(urls.sessionUrl).not.toBe(urls.redirectUri);
  });

  test("credentials are required under dedicated AUTH_VENDASTA_* names", () => {
    expect(
      isVendastaOidcConfigured({
        AUTH_VENDASTA_ID: "id",
        AUTH_VENDASTA_SECRET: "secret",
      })
    ).toBe(true);
    expect(
      isVendastaOidcConfigured({
        AUTH_GOOGLE_ID: "id",
        AUTH_GOOGLE_SECRET: "secret",
      })
    ).toBe(false);
    expect(isVendastaOidcConfigured({ AUTH_VENDASTA_ID: "id" })).toBe(false);
  });
});

describe("legacy Session Url", () => {
  test("refuses JWTs and does not mint a session", () => {
    expect(vendastaLegacySessionResponse()).toEqual({
      status: 410,
      body: LEGACY_SESSION_DISABLED,
    });
    expect(LEGACY_SESSION_DISABLED.entryUrl).toBe("/auth/vendasta");
    expect(LEGACY_SESSION_DISABLED.error).toBe(
      "legacy_session_transfer_disabled"
    );
  });
});
