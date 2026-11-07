import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ENABLE_DEV_AUTH = process.env.ENABLE_DEV_AUTH === "true";

export default async function SignInPage() {
  const session = await auth();

  if (session) {
    redirect("/people");
  }

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
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/people" });
            }}
          >
            <Button type="submit" className="w-full">
              Sign in with Google
            </Button>
          </form>

          {ENABLE_DEV_AUTH && (
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
              <form
                action={async (formData: FormData) => {
                  "use server";
                  const email = formData.get("email") as string;
                  await signIn("credentials", {
                    email,
                    redirectTo: "/people",
                  });
                }}
                className="space-y-2"
              >
                <input
                  type="email"
                  name="email"
                  placeholder="your.name@vendasta.com"
                  required
                  className="w-full rounded-md border px-3 py-2"
                />
                <Button type="submit" variant="outline" className="w-full">
                  Dev Login
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
