import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getHeadcountReport } from "@/lib/reports/headcount";
import Link from "next/link";

export default async function HeadcountReportPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/people");
  }

  const report = await getHeadcountReport();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Headcount Report</h1>
          <p className="text-muted-foreground">Active employees by department, location, and status</p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/reports/export?type=headcount" download>
            Export CSV
          </a>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active Headcount</CardTitle>
            <CardDescription>Full-time, part-time, and contractor</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{report.totalActive}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {report.terminated} terminated (excluded from active total)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.byStatus.map((row) => (
              <div key={row.employmentStatus} className="flex justify-between text-sm">
                <span className="capitalize">{row.employmentStatus.replace("_", " ")}</span>
                <span className="font-medium">{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By Department</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.byDepartment.map((row) => (
            <div key={row.departmentId ?? "none"} className="flex justify-between text-sm">
              <span>{row.department || "No Department"}</span>
              <span className="font-medium">{row.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.byLocation.map((row) => (
            <div key={row.locationId ?? "none"} className="flex justify-between text-sm">
              <span>{row.location || "No Location"}</span>
              <span className="font-medium">{row.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button asChild variant="ghost">
        <Link href="/reports">Back to reports</Link>
      </Button>
    </div>
  );
}
