import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "./ui/button";
import { Users, Building2, LayoutGrid, Calendar, ListTodo, Settings, Briefcase } from "lucide-react";

export async function Nav() {
  const session = await auth();

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/people" className="text-xl font-bold text-primary">
            vPeople
          </Link>
          <div className="flex gap-6">
            <Link
              href="/people"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary"
            >
              <Users className="h-4 w-4" />
              People
            </Link>
            <Link
              href="/org-chart"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary"
            >
              <Building2 className="h-4 w-4" />
              Org Chart
            </Link>
            <Link
              href="/seats"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary"
            >
              <LayoutGrid className="h-4 w-4" />
              Seats
            </Link>
            <Link
              href="/time-off"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary"
            >
              <Calendar className="h-4 w-4" />
              Time Off
            </Link>
            <Link
              href="/tasks"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary"
            >
              <ListTodo className="h-4 w-4" />
              Tasks
            </Link>
            <Link
              href="/hiring"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary"
            >
              <Briefcase className="h-4 w-4" />
              Hiring
            </Link>
            {(session?.user?.role === "admin" || session?.user?.role === "full_admin") && (
              <>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <Link
                  href="/admin"
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary"
                >
                  <Settings className="h-4 w-4" />
                  Admin
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session?.user?.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/auth/signin" });
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Sign Out
            </Button>
          </form>
        </div>
      </div>
    </nav>
  );
}
