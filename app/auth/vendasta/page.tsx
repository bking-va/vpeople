import { redirect } from "next/navigation";
import { VendastaSsoEntry } from "@/components/vendasta-sso-entry";
import {
  isVendastaOidcConfigured,
  parseVendastaEntrySearchParams,
} from "@/lib/vendasta-oidc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Admin Center Entry Url. GET only renders this page; OAuth starts on the
 * CSRF-protected server-action POST (PKCE + state + nonce cookies are set
 * there). Auth.js GET /api/auth/signin/vendasta does not initiate OIDC.
 */
export default async function VendastaEntryPage({
  searchParams,
}: {
  searchParams: Promise<{
    account_id?: string;
    nextUrl?: string;
    callbackUrl?: string;
  }>;
}) {
  if (!isVendastaOidcConfigured()) {
    redirect("/auth/error?error=Configuration");
  }

  const params = await searchParams;
  const parsed = parseVendastaEntrySearchParams(
    new URLSearchParams({
      account_id: params.account_id ?? "",
      nextUrl: params.nextUrl ?? params.callbackUrl ?? "",
    })
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">vPeople</CardTitle>
          <CardDescription>
            Redirecting to Vendasta to sign in
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VendastaSsoEntry
            accountId={parsed.authorizationParams.account_id}
            nextUrl={parsed.callbackUrl}
          />
        </CardContent>
      </Card>
    </div>
  );
}
