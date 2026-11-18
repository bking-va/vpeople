import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authErrorDescription } from "@/lib/auth-error-message";
import { isVendastaOidcConfigured } from "@/lib/vendasta-oidc";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const description = authErrorDescription(error, {
    vendastaConfigured: isVendastaOidcConfigured(),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-destructive">
            Authentication Error
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/auth/signin">Back to Sign In</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
