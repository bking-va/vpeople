import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Calendar, CheckCircle, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function TimeTrackingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const isAdmin = session.user.role === "admin" || session.user.role === "full_admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Time & Attendance</h1>
          <p className="text-muted-foreground">
            Track time, manage timesheets, and approve hours
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Hours This Week</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0.0</div>
            <p className="text-xs text-muted-foreground">Out of 40.0 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <PlayCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0.0</div>
            <p className="text-xs text-muted-foreground">Hours today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant="outline">Clocked Out</Badge>
            <p className="text-xs text-muted-foreground mt-1">Not tracking</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overtime</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0.0</div>
            <p className="text-xs text-muted-foreground">This period</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Time Clock</CardTitle>
          <CardDescription>Clock in and out for your shift</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-4xl font-bold mb-6">
              {new Date().toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="flex gap-3">
              <Button size="lg" className="w-32">
                <PlayCircle className="h-5 w-5 mr-2" />
                Clock In
              </Button>
              <Button size="lg" variant="outline" className="w-32" disabled>
                <Clock className="h-5 w-5 mr-2" />
                Clock Out
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Currently clocked out
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Timesheet</CardTitle>
          <CardDescription>Your time entries for this week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Time Entries</h3>
            <p className="text-muted-foreground">
              Clock in to start tracking your time
            </p>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
            <CardDescription>Timesheets awaiting manager approval</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No timesheets pending approval
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
