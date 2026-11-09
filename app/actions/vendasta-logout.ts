"use server";

import { signOut } from "@/lib/auth";
import { VENDASTA_LOGOUT_PATH } from "@/lib/vendasta-oidc";

/**
 * CSRF-protected sign-out. Always returns to the logout landing page.
 * Query/form return URLs, JWTs, and OAuth codes are ignored.
 */
export async function confirmVendastaSignOut(_formData?: FormData) {
  await signOut({ redirectTo: VENDASTA_LOGOUT_PATH });
}
