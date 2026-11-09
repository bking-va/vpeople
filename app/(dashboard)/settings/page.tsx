import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        <Link href="/settings/access-levels">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader>
              <CardTitle>Access Levels</CardTitle>
              <CardDescription>
                Manage user roles and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configure who can view and edit compensation, sensitive personal information, and bank data.
                Define approval rights and system administration access.
              </p>
              <Button variant="outline" className="mt-4 w-full">
                Manage Access Levels →
              </Button>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/workflows">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader>
              <CardTitle>Approval Workflows</CardTitle>
              <CardDescription>
                Configure approval processes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Enable or disable workflows for time off, compensation changes, job information updates, and more.
                Configure approval chains and auto-approval rules.
              </p>
              <Button variant="outline" className="mt-4 w-full">
                Manage Workflows →
              </Button>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/time-off-policies">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardHeader>
              <CardTitle>Time Off Policies</CardTitle>
              <CardDescription>
                Manage vacation and leave policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configure time-off policies including accrual rates, carryover limits, and approval requirements.
                Manage vacation, sick leave, and other leave types.
              </p>
              <Button variant="outline" className="mt-4 w-full">
                Manage Policies →
              </Button>
            </CardContent>
          </Card>
        </Link>

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
              <Link href="/settings/job-titles" className="block p-2 hover:bg-accent rounded">
                <p className="font-medium">Job Titles</p>
                <p className="text-sm text-muted-foreground">Maintain the list of job titles</p>
              </Link>
              <Link href="/settings/termination-reasons" className="block p-2 hover:bg-accent rounded">
                <p className="font-medium">Termination Reasons</p>
                <p className="text-sm text-muted-foreground">Configurable reasons with Canadian ROE codes</p>
              </Link>
              <Link href="/settings/letter-templates" className="block p-2 hover:bg-accent rounded">
                <p className="font-medium">Letter templates</p>
                <p className="text-sm text-muted-foreground">Offer, merit, promotion, title, commission, termination</p>
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
