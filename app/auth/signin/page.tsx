import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDevLoginEnabled } from "@/lib/authz";
import { isVendastaOidcConfigured } from "@/lib/vendasta-oidc";
import { SignInForm } from "@/components/sign-in-form";

export default async function SignInPage() {
  const session = await auth();

  if (session) {
    redirect("/people");
  }

  return (
    <SignInForm
      enableDevAuth={isDevLoginEnabled()}
      vendastaConfigured={isVendastaOidcConfigured()}
    />
  );
}
