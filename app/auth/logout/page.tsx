import Link from "next/link";
import { auth } from "@/lib/auth";
import { confirmVendastaSignOut } from "@/app/actions/vendasta-logout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Front-channel logout landing for Admin Center "Logout URI".
 * GET never mutates the session (safe in a hidden iframe). Sign-out is a
 * CSRF-protected POST. Search params (code, state, id_token, returnUrl) are ignored.
 */
export default async function LogoutPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">vPeople</CardTitle>
          <CardDescription>
            {session?.user
              ? "Sign out of vPeople"
              : "You are signed out of vPeople"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {session?.user ? (
            <form action={confirmVendastaSignOut}>
              <Button type="submit" className="w-full">
                Sign out
              </Button>
            </form>
          ) : (
            <Button asChild className="w-full">
              <Link href="/auth/signin">Back to Sign In</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
