import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  getAdditionsTerminations,
  getYearsOfService,
  getTimeOffBalanceReport,
  getTimeOffUsedReport,
  getLastPayChangeReport,
  getBirthdaysReport,
  getAgeGenderReport,
  getJobHistoryReport,
  getEmploymentStatusHistoryReport,
  getPeopleWithoutRaise,
} from "@/lib/reports/standard";
import { getUserPermissions } from "@/lib/permissions";

export default async function StandardReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/people");
  }

  const { type = "additions" } = await searchParams;
  const year = new Date().getUTCFullYear();
  const permissions = session.user.email
    ? await getUserPermissions(session.user.email)
    : null;

  let title = "Standard Report";
  let body: ReactNode = null;

  if (type === "additions") {
    title = "Additions / Terminations";
    const data = await getAdditionsTerminations(year);
    body = (
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>New hires {year}</CardTitle>
            <CardDescription>{data.additions.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.additions.map((row) => (
              <div key={row.id} className="text-sm flex justify-between">
                <Link href={`/people/${row.id}`} className="text-primary hover:underline">
                  {row.firstName} {row.lastName}
                </Link>
                <span className="text-muted-foreground">{row.hireDate}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Terminations {year}</CardTitle>
            <CardDescription>{data.terminations.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.terminations.map((row) => (
              <div key={row.id} className="text-sm flex justify-between">
                <Link href={`/people/${row.id}`} className="text-primary hover:underline">
                  {row.firstName} {row.lastName}
                </Link>
                <span className="text-muted-foreground">{row.terminationDate}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  } else if (type === "years-of-service") {
    title = "Years of Service";
    const rows = await getYearsOfService();
    body = (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="text-sm flex justify-between">
              <Link href={`/people/${row.id}`} className="text-primary hover:underline">
                {row.firstName} {row.lastName}
              </Link>
              <span>{row.yearsOfService} years</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  } else if (type === "time-off-balances") {
    title = "Time Off Balances";
    const rows = await getTimeOffBalanceReport();
    body = (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {rows.map((row, idx) => (
            <div key={`${row.employeeId}-${idx}`} className="text-sm flex justify-between">
              <span>
                {row.firstName} {row.lastName} · {row.policy}
              </span>
              <span className="font-medium">{parseFloat(row.balance).toFixed(1)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  } else if (type === "time-off-used") {
    title = "Time Off Used";
    const rows = await getTimeOffUsedReport(year);
    body = (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {rows.map((row, idx) => (
            <div key={`${row.employeeId}-${idx}`} className="text-sm flex justify-between">
              <span>
                {row.firstName} {row.lastName} · {row.policy}
              </span>
              <span>
                {row.daysRequested} days ({row.startDate})
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  } else if (type === "last-pay-change") {
    title = "Last Pay Change";
    const rows = permissions?.canViewCompensation ? await getLastPayChangeReport() : [];
    body = (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {!permissions?.canViewCompensation ? (
            <p className="text-sm text-muted-foreground">Compensation permission required</p>
          ) : (
            rows.map((row) => (
              <div key={row.employeeId} className="text-sm flex justify-between">
                <Link href={`/people/${row.employeeId}`} className="text-primary hover:underline">
                  {row.firstName} {row.lastName}
                </Link>
                <span>
                  {row.payRate} · {row.effectiveDate}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  } else if (type === "birthdays") {
    title = "Birthdays";
    const rows = await getBirthdaysReport();
    body = (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="text-sm flex justify-between">
              <span>
                {row.firstName} {row.lastName}
              </span>
              <span className="text-muted-foreground">{row.birthDate || "—"}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  } else if (type === "age-gender") {
    title = "Age / Gender Profile";
    const data = await getAgeGenderReport();
    body = (
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Gender</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.byGender.map((row) => (
              <div key={row.gender} className="flex justify-between text-sm">
                <span className="capitalize">{row.gender}</span>
                <span>{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Age bands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.byAgeBand.map((row) => (
              <div key={row.band} className="flex justify-between text-sm">
                <span>{row.band}</span>
                <span>{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  } else if (type === "job-history") {
    title = "Job History";
    const rows = await getJobHistoryReport();
    body = (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {rows.map((row, idx) => (
            <div key={`${row.employeeId}-${idx}`} className="text-sm flex justify-between">
              <span>
                {row.firstName} {row.lastName} · {row.jobTitle || "—"}
              </span>
              <span className="text-muted-foreground">{row.effectiveDate}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  } else if (type === "no-raise") {
    title = "People without a raise in 12+ months";
    const rows = await getPeopleWithoutRaise();
    body = (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everyone has a raise in the last 12 months</p>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="text-sm flex justify-between">
                <Link href={`/people/${row.id}`} className="text-primary hover:underline">
                  {row.firstName} {row.lastName}
                </Link>
                <span className="text-muted-foreground">
                  {row.lastRaiseDate || "no raise on file"}
                  {permissions?.canViewCompensation && row.lastPayRate ? ` · ${row.lastPayRate}` : ""}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  } else if (type === "employment-status") {
    title = "Employment Status History";
    const rows = await getEmploymentStatusHistoryReport();
    body = (
      <Card>
        <CardContent className="pt-6 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="text-sm flex justify-between">
              <Link href={`/people/${row.id}`} className="text-primary hover:underline">
                {row.firstName} {row.lastName}
              </Link>
              <span>
                {row.employmentStatus}
                {row.terminationDate ? ` · ended ${row.terminationDate}` : ""}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
      </div>
      {body}
      <Button asChild variant="ghost">
        <Link href="/reports">Back to reports</Link>
      </Button>
    </div>
  );
}
