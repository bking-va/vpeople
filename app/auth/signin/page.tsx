import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "@/components/sign-in-form";

const ENABLE_DEV_AUTH = process.env.ENABLE_DEV_AUTH === "true";

export default async function SignInPage() {
  const session = await auth();

  if (session) {
    redirect("/people");
  }

  return <SignInForm enableDevAuth={ENABLE_DEV_AUTH} />;
}
