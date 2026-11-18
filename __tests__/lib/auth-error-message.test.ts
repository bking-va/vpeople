import { readFileSync } from "fs";
import { join } from "path";
import { authErrorDescription } from "@/lib/auth-error-message";

describe("auth error page copy", () => {
  test("AccessDenied still names unauthorized Vendasta identity", () => {
    expect(authErrorDescription("AccessDenied", { vendastaConfigured: true })).toBe(
      "This Vendasta identity is not authorized for vPeople."
    );
  });

  test("Configuration with SSO configured does not blame missing Vendasta SSO", () => {
    expect(
      authErrorDescription("Configuration", { vendastaConfigured: true })
    ).toBe("Sign-in configuration error, contact an admin");
  });

  test("Configuration without SSO configured still says SSO is missing", () => {
    expect(
      authErrorDescription("Configuration", { vendastaConfigured: false })
    ).toBe("Vendasta SSO is not configured in this environment.");
  });

  test("unknown errors stay generic", () => {
    expect(authErrorDescription("OAuthCallback", { vendastaConfigured: true })).toBe(
      "There was a problem signing you in. Please try again."
    );
    expect(authErrorDescription(undefined, { vendastaConfigured: false })).toBe(
      "There was a problem signing you in. Please try again."
    );
  });

  test("error page uses authErrorDescription and live SSO config", () => {
    const source = readFileSync(
      join(process.cwd(), "app/auth/error/page.tsx"),
      "utf8"
    );
    expect(source).toMatch(/authErrorDescription/);
    expect(source).toMatch(/isVendastaOidcConfigured/);
  });
});
