import { db } from "@/lib/db";
import { employeeTasks, employees } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function TasksPage() {
  const session = await auth();

  if (!session?.user?.employeeId) {
    redirect("/people");
  }

  const employeeId = session.user.employeeId;

  const myTasks = await db
    .select({
      task: employeeTasks,
      employee: employees,
    })
    .from(employeeTasks)
    .leftJoin(employees, eq(employeeTasks.employeeId, employees.id))
    .where(
      or(
        eq(employeeTasks.employeeId, employeeId),
        eq(employeeTasks.assignedToId, employeeId)
      )
    );

  const onboardingTasks = myTasks.filter((t) => t.task.taskType === "onboarding");
  const offboardingTasks = myTasks.filter((t) => t.task.taskType === "offboarding");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tasks</h1>
        <p className="text-muted-foreground">
          Onboarding and offboarding task management
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding Tasks ({onboardingTasks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {onboardingTasks.length > 0 ? (
              <div className="space-y-3">
                {onboardingTasks.map((item) => {
                  const task = item.task;
                  const emp = item.employee;
                  const empName = emp
                    ? emp.preferredName
                      ? `${emp.preferredName} ${emp.lastName}`
                      : `${emp.firstName} ${emp.lastName}`
                    : "Unknown";

                  return (
                    <div key={task.id} className="border-b pb-3 last:border-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{task.title}</p>
                          <p className="text-sm text-muted-foreground">
                            For:{" "}
                            <Link
                              href={`/people/${emp?.id}`}
                              className="text-primary hover:underline"
                            >
                              {empName}
                            </Link>
                          </p>
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground">
                              Due: {formatDate(task.dueDate)}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={
                            task.status === "completed"
                              ? "default"
                              : task.status === "in_progress"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {task.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No onboarding tasks
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offboarding Tasks ({offboardingTasks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {offboardingTasks.length > 0 ? (
              <div className="space-y-3">
                {offboardingTasks.map((item) => {
                  const task = item.task;
                  const emp = item.employee;
                  const empName = emp
                    ? emp.preferredName
                      ? `${emp.preferredName} ${emp.lastName}`
                      : `${emp.firstName} ${emp.lastName}`
                    : "Unknown";

                  return (
                    <div key={task.id} className="border-b pb-3 last:border-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{task.title}</p>
                          <p className="text-sm text-muted-foreground">
                            For:{" "}
                            <Link
                              href={`/people/${emp?.id}`}
                              className="text-primary hover:underline"
                            >
                              {empName}
                            </Link>
                          </p>
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground">
                              Due: {formatDate(task.dueDate)}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={
                            task.status === "completed"
                              ? "default"
                              : task.status === "in_progress"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {task.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No offboarding tasks
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
