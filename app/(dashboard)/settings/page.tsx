import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage system configuration and permissions</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Access Levels</CardTitle>
            <CardDescription>
              Manage user roles and permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 border-b">
                <div>
                  <p className="font-medium">Full Admin</p>
                  <p className="text-sm text-muted-foreground">Complete system access</p>
                </div>
                <Badge>Active</Badge>
              </div>
              <div className="flex justify-between items-center p-2 border-b">
                <div>
                  <p className="font-medium">Admin</p>
                  <p className="text-sm text-muted-foreground">HR and people management</p>
                </div>
                <Badge>Active</Badge>
              </div>
              <div className="flex justify-between items-center p-2 border-b">
                <div>
                  <p className="font-medium">Manager</p>
                  <p className="text-sm text-muted-foreground">Team management</p>
                </div>
                <Badge>Active</Badge>
              </div>
              <div className="flex justify-between items-center p-2">
                <div>
                  <p className="font-medium">Employee</p>
                  <p className="text-sm text-muted-foreground">Standard access</p>
                </div>
                <Badge>Active</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval Workflows</CardTitle>
            <CardDescription>
              Configure approval processes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 border-b">
                <div>
                  <p className="font-medium">Time Off Requests</p>
                  <p className="text-sm text-muted-foreground">Requires manager approval</p>
                </div>
                <Badge variant="secondary">Enabled</Badge>
              </div>
              <div className="flex justify-between items-center p-2 border-b">
                <div>
                  <p className="font-medium">Information Updates</p>
                  <p className="text-sm text-muted-foreground">Auto-approved</p>
                </div>
                <Badge variant="outline">Disabled</Badge>
              </div>
              <div className="flex justify-between items-center p-2">
                <div>
                  <p className="font-medium">Compensation Changes</p>
                  <p className="text-sm text-muted-foreground">Requires admin approval</p>
                </div>
                <Badge variant="secondary">Enabled</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organizational Structure</CardTitle>
            <CardDescription>
              Manage departments, divisions, and locations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/admin" className="block p-2 hover:bg-accent rounded">
                <p className="font-medium">Departments & Divisions</p>
                <p className="text-sm text-muted-foreground">View and manage org structure</p>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>
              System preferences and defaults
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Date Format</span>
                <Badge variant="outline">YYYY-MM-DD</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Currency</span>
                <Badge variant="outline">CAD</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Timezone</span>
                <Badge variant="outline">America/Regina</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
