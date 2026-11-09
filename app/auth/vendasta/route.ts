import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import {
  isVendastaOidcConfigured,
  parseVendastaEntrySearchParams,
  VENDASTA_PROVIDER_ID,
} from "@/lib/vendasta-oidc";

/**
 * Admin Center / marketplace Entry URL.
 * GET /auth/vendasta?account_id={account_id}&nextUrl=/people
 *
 * Auth.js GET /api/auth/signin/vendasta does not start OAuth (CSRF / HTML
 * sign-in page). This handler calls signIn() which POSTs internally, sets
 * PKCE + state + nonce cookies, and redirects to the authorization endpoint.
 */
export async function GET(request: NextRequest) {
  if (!isVendastaOidcConfigured()) {
    return NextResponse.redirect(
      new URL("/auth/error?error=Configuration", request.url)
    );
  }

  const parsed = parseVendastaEntrySearchParams(request.nextUrl.searchParams);
  await signIn(
    VENDASTA_PROVIDER_ID,
    { redirectTo: parsed.callbackUrl },
    parsed.authorizationParams
  );
}
