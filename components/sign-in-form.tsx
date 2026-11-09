"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { startVendastaSignIn } from "@/app/actions/vendasta-sso";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SignInForm({
  enableDevAuth,
  vendastaConfigured,
}: {
  enableDevAuth: boolean;
  vendastaConfigured: boolean;
}) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn("credentials", {
        email,
        callbackUrl: "/people",
      });
    } catch (error) {
      console.error("Sign in error:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">vPeople</CardTitle>
          <CardDescription>
            Sign in with your Vendasta account to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {vendastaConfigured ? (
            <form action={startVendastaSignIn}>
              <Button type="submit" className="w-full" disabled={isLoading}>
                Sign in with Vendasta
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Vendasta SSO is not configured in this environment.
            </p>
          )}

          {enableDevAuth && (
            <div className="space-y-2">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">
                    Or for development
                  </span>
                </div>
              </div>
              <form onSubmit={handleDevLogin} className="space-y-2">
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.name@vendasta.com"
                  required
                  disabled={isLoading}
                  className="w-full rounded-md border px-3 py-2 disabled:opacity-50"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Dev Login"}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
