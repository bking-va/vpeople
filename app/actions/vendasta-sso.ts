"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import {
  isVendastaOidcConfigured,
  parseVendastaEntrySearchParams,
  VENDASTA_PROVIDER_ID,
} from "@/lib/vendasta-oidc";

export async function startVendastaSignIn(formData?: FormData) {
  if (!isVendastaOidcConfigured()) {
    redirect("/auth/error?error=Configuration");
  }

  const params = new URLSearchParams();
  const accountId = formData?.get("account_id");
  const nextUrl = formData?.get("nextUrl") ?? formData?.get("callbackUrl");
  if (typeof accountId === "string") params.set("account_id", accountId);
  if (typeof nextUrl === "string") params.set("nextUrl", nextUrl);

  const parsed = parseVendastaEntrySearchParams(params);
  await signIn(
    VENDASTA_PROVIDER_ID,
    { redirectTo: parsed.callbackUrl },
    parsed.authorizationParams
  );
}
