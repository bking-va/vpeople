import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auditLogs, employees, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function AuditLogPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  // Check if user is full admin
  const employeeId = session.user.employeeId;
  if (!employeeId) {
    redirect("/settings");
  }

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
    redirect("/settings");
  }

  // Fetch recent audit logs
  const logs = await db
    .select({
      log: auditLogs,
      user: {
        name: users.name,
        email: users.email,
      },
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("create")) return "default";
    if (action.includes("delete") || action.includes("terminate")) return "destructive";
    if (action.includes("approve")) return "default";
    return "secondary";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Trail</h1>
        <p className="text-muted-foreground">
          Comprehensive log of all system changes and actions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Last 100 audit events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="space-y-3">
              {logs.map((item) => {
                const log = item.log;
                const user = item.user;

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <Badge variant={getActionBadgeVariant(log.action)}>
                      {log.action.replace(/_/g, " ")}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">
                          {user?.name || user?.email || "System"}
                        </span>
                        <span className="text-muted-foreground">
                          {log.action.replace("_", " ")} {log.entityType}
                        </span>
                        {log.entityId && (
                          <span className="text-muted-foreground">
                            #{log.entityId}
                          </span>
                        )}
                      </div>
                      
                      {log.changes && typeof log.changes === "object" && Object.keys(log.changes).length > 0 ? (
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          {Object.entries(log.changes as Record<string, unknown>).map(([key, value]) => {
                            const isSensitive =
                              key.toLowerCase().includes("salary") ||
                              key.toLowerCase().includes("compensation") ||
                              key.toLowerCase().includes("sin") ||
                              key.toLowerCase().includes("ssn") ||
                              key.toLowerCase().includes("bank");

                            if (isSensitive) {
                              return (
                                <div key={key} className="flex gap-2">
                                  <span className="font-medium">{key}:</span>
                                  <span className="italic">Changed (value redacted)</span>
                                </div>
                              );
                            }

                            return (
                              <div key={key} className="flex gap-2">
                                <span className="font-medium">{key}:</span>
                                <span>
                                  {typeof value === "object"
                                    ? JSON.stringify(value)
                                    : String(value)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(log.createdAt)}
                        {log.ipAddress && <span> • {log.ipAddress}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No audit logs found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
