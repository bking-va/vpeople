import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, timeOffRequests, departments, divisions } from "@/lib/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Users, Calendar, TrendingUp } from "lucide-react";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/people");
  }

  // Headcount by department
  const headcountByDept = await db
    .select({
      department: departments.name,
      count: sql<number>`count(*)::int`,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .groupBy(departments.name)
    .orderBy(departments.name);

  // Total headcount
  const [totalHeadcount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees);

  // New hires this year
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [newHires] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(gte(employees.hireDate, yearStart));

  // Time off requests this month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [timeOffThisMonth] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(timeOffRequests)
    .where(gte(timeOffRequests.startDate, monthStart));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">HR Reports & Analytics</h1>
        <p className="text-muted-foreground">Company-wide metrics and insights</p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Headcount</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHeadcount?.count || 0}</div>
            <p className="text-xs text-muted-foreground">Active employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">New Hires YTD</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newHires?.count || 0}</div>
            <p className="text-xs text-muted-foreground">{new Date().getFullYear()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Time Off This Month</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{timeOffThisMonth?.count || 0}</div>
            <p className="text-xs text-muted-foreground">Requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Reports</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5</div>
            <p className="text-xs text-muted-foreground">Standard reports</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Headcount by Department</CardTitle>
          <CardDescription>Active employees per department</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {headcountByDept.map((row) => (
              <div key={row.department} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
                    {row.count}
                  </div>
                  <span className="font-medium">{row.department || "No Department"}</span>
                </div>
                <div className="flex-1 mx-4">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${((row.count / (totalHeadcount?.count || 1)) * 100).toFixed(0)}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {((row.count / (totalHeadcount?.count || 1)) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Standard Reports</CardTitle>
            <CardDescription>Pre-built HR reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <div className="font-medium">Headcount Report</div>
                <div className="text-sm text-muted-foreground">Active employees by department</div>
              </div>
              <div className="p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <div className="font-medium">New Hires Report</div>
                <div className="text-sm text-muted-foreground">Recent hires by period</div>
              </div>
              <div className="p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <div className="font-medium">Time Off Report</div>
                <div className="text-sm text-muted-foreground">Time off requests and balances</div>
              </div>
              <div className="p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <div className="font-medium">Turnover Report</div>
                <div className="text-sm text-muted-foreground">Terminations and turnover rate</div>
              </div>
              <div className="p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <div className="font-medium">Compensation Report</div>
                <div className="text-sm text-muted-foreground">Salary ranges by department</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom Report Builder</CardTitle>
            <CardDescription>Build your own reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Custom Reports</h3>
              <p className="text-muted-foreground mb-4">
                Create custom reports with specific fields and filters
              </p>
              <div className="p-3 border rounded-lg bg-muted">
                <p className="text-sm">Coming soon: Drag-and-drop report builder</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
