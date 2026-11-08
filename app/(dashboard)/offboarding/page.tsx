import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employeeTasks, taskTemplates, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default async function OffboardingPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/people");
  }

  const tasks = await db
    .select({
      task: employeeTasks,
      employee: {
        firstName: employees.firstName,
        lastName: employees.lastName,
      },
      template: {
        name: taskTemplates.name,
        description: taskTemplates.description,
      },
    })
    .from(employeeTasks)
    .leftJoin(employees, eq(employeeTasks.employeeId, employees.id))
    .leftJoin(taskTemplates, eq(employeeTasks.templateId, taskTemplates.id))
    .where(eq(taskTemplates.taskType, "offboarding"))
    .orderBy(employeeTasks.dueDate);

  const templates = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.taskType, "offboarding"));

  const completedCount = tasks.filter((t) => t.task.status === "completed").length;
  const pendingCount = tasks.length - completedCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Offboarding</h1>
          <p className="text-muted-foreground">
            Manage employee departure tasks
          </p>
        </div>
        <Button asChild>
          <Link href="/offboarding/templates">Manage Templates</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Offboardings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCount}</div>
            <p className="text-xs text-muted-foreground">Tasks done</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Templates</CardTitle>
            <Circle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
            <p className="text-xs text-muted-foreground">Task templates</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Offboarding Tasks</CardTitle>
          <CardDescription>
            Track employee departure checklist
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No active offboarding tasks</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((item) => (
                <div
                  key={item.task.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    {item.task.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <div>
                      <div className="font-medium">
                        {item.template?.name || "Task"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.employee?.firstName} {item.employee?.lastName}
                        {item.task.dueDate && (
                          <> • Due {new Date(item.task.dueDate).toLocaleDateString()}</>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge variant={item.task.status === "completed" ? "default" : "secondary"}>
                    {item.task.status === "completed" ? "Complete" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
