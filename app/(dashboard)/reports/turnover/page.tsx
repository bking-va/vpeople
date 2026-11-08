import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTurnoverReport } from "@/lib/reports/turnover";
import Link from "next/link";

export default async function TurnoverReportPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/people");
  }

  const report = await getTurnoverReport();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Turnover Report</h1>
          <p className="text-muted-foreground">
            {report.windowStart} to {report.windowEnd}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/reports/export?type=turnover" download>
            Export CSV
          </a>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Turnover Rate</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{report.turnoverRate}%</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Terminations</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{report.terminations}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hires</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{report.hires}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly hires vs terminations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.byMonth.map((row) => (
            <div key={row.month} className="flex justify-between text-sm">
              <span>{row.month}</span>
              <span>
                +{row.hires} / −{row.terms}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terminations</CardTitle>
          <CardDescription>{report.terminationsDetail.length} people</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.terminationsDetail.length === 0 ? (
            <p className="text-sm text-muted-foreground">No terminations in this window</p>
          ) : (
            report.terminationsDetail.map((row) => (
              <div key={row.id} className="flex justify-between text-sm">
                <Link href={`/people/${row.id}`} className="text-primary hover:underline">
                  {row.firstName} {row.lastName}
                </Link>
                <span className="text-muted-foreground">{row.terminationDate}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button asChild variant="ghost">
        <Link href="/reports">Back to reports</Link>
      </Button>
    </div>
  );
}
