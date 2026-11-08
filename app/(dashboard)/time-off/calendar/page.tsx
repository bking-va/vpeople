import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { timeOffRequests, employees, timeOffPolicies } from "@/lib/db/schema";
import { eq, gte, lte, and, or } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function TimeOffCalendarPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Get current month's date range
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const startDate = startOfMonth.toISOString().split("T")[0];
  const endDate = endOfMonth.toISOString().split("T")[0];

  // Get all approved time off that overlaps with current month
  const timeOffList = await db
    .select({
      request: timeOffRequests,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      employeePreferredName: employees.preferredName,
      employeeId: employees.id,
      policyName: timeOffPolicies.name,
      policyType: timeOffPolicies.policyType,
    })
    .from(timeOffRequests)
    .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
    .where(
      and(
        eq(timeOffRequests.status, "approved"),
        or(
          and(
            gte(timeOffRequests.startDate, startDate),
            lte(timeOffRequests.startDate, endDate)
          ),
          and(
            gte(timeOffRequests.endDate, startDate),
            lte(timeOffRequests.endDate, endDate)
          ),
          and(
            lte(timeOffRequests.startDate, startDate),
            gte(timeOffRequests.endDate, endDate)
          )
        )
      )
    );

  // Group by date
  const dayMap = new Map<string, typeof timeOffList>();
  
  for (const item of timeOffList) {
    const start = new Date(item.request.startDate);
    const end = new Date(item.request.endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split("T")[0];
      if (dateKey >= startDate && dateKey <= endDate) {
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, []);
        }
        dayMap.get(dateKey)!.push(item);
      }
    }
  }

  // Generate calendar grid
  const daysInMonth = endOfMonth.getDate();
  const firstDayOfWeek = startOfMonth.getDay();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Who&apos;s Out</h1>
          <p className="text-muted-foreground">
            {startOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/time-off">Back to Time Off</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-7 gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-center font-semibold text-sm p-2">
                {day}
              </div>
            ))}

            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-24 border rounded p-2 bg-gray-50" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(today.getFullYear(), today.getMonth(), day);
              const dateKey = date.toISOString().split("T")[0];
              const peopleOut = dayMap.get(dateKey) || [];
              const isToday = dateKey === today.toISOString().split("T")[0];

              return (
                <div
                  key={day}
                  className={`min-h-24 border rounded p-2 ${
                    isToday ? "bg-blue-50 border-blue-300" : "bg-white"
                  }`}
                >
                  <div className="text-sm font-semibold mb-1">{day}</div>
                  <div className="space-y-1">
                    {peopleOut.slice(0, 3).map((person, idx) => {
                      const name =
                        person.employeePreferredName ||
                        person.employeeFirstName;
                      return (
                        <Link
                          key={idx}
                          href={`/people/${person.employeeId}`}
                          className="block"
                        >
                          <Badge
                            variant="secondary"
                            className="text-xs w-full justify-start truncate"
                          >
                            {name}
                          </Badge>
                        </Link>
                      );
                    })}
                    {peopleOut.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{peopleOut.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Time Off This Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {timeOffList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No time off scheduled this month
              </p>
            ) : (
              timeOffList.map((item, idx) => {
                const name =
                  item.employeePreferredName || item.employeeFirstName;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <div>
                      <Link
                        href={`/people/${item.employeeId}`}
                        className="font-medium hover:underline"
                      >
                        {name} {item.employeeLastName}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {item.policyName}
                      </p>
                    </div>
                    <div className="text-sm text-right">
                      <div>
                        {item.request.startDate} to {item.request.endDate}
                      </div>
                      <div className="text-muted-foreground">
                        {item.request.daysRequested} days
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
