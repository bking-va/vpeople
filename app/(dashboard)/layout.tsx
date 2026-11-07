import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="container mx-auto py-6 px-4">{children}</main>
    </div>
  );
}
