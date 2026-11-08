import { db } from "@/lib/db";
import { timeOffRequests, employees, timeOffPolicies } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TimeOffActions } from "@/components/time-off-actions";
import { ApprovalStatus } from "@/components/approval-status";
import { getApprovalRequestForEntity } from "@/lib/approvals";

export default async function TimeOffApprovalsPage() {
  const session = await auth();

  if (!session?.user?.employeeId) {
    redirect("/people");
  }

  const employeeId = session.user.employeeId;

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) {
    redirect("/people");
  }

  // Check if user is a manager or admin
  const isAdmin = session.user.role === "full_admin" || session.user.role === "admin";
  
  const directReports = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.managerId, employeeId));

  const reportIds = directReports.map((r) => r.id);

  if (!isAdmin && reportIds.length === 0) {
    redirect("/time-off");
  }

  // Get pending requests for direct reports (or all if admin)
  const pendingRequestsQuery = isAdmin
    ? db
        .select({
          request: timeOffRequests,
          employee: employees,
          policy: timeOffPolicies,
        })
        .from(timeOffRequests)
        .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
        .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
        .where(eq(timeOffRequests.status, "pending"))
    : db
        .select({
          request: timeOffRequests,
          employee: employees,
          policy: timeOffPolicies,
        })
        .from(timeOffRequests)
        .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
        .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
        .where(
          and(
            eq(timeOffRequests.status, "pending"),
            inArray(timeOffRequests.employeeId, reportIds)
          )
        );

  const pendingRequests = await pendingRequestsQuery;

  // Fetch approval request data for each pending request
  const requestsWithApprovals = await Promise.all(
    pendingRequests.map(async (item) => {
      const approvalData = await getApprovalRequestForEntity(
        "time_off_request",
        item.request.id
      );
      return {
        ...item,
        approvalData,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Time Off Approvals</h1>
          <p className="text-muted-foreground">
            Review and approve time off requests from {isAdmin ? "all employees" : "your direct reports"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Approvals ({requestsWithApprovals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {requestsWithApprovals.length > 0 ? (
            <div className="space-y-6">
              {requestsWithApprovals.map((item) => {
                const emp = item.employee;
                const req = item.request;
                const policy = item.policy;
                const approvalData = item.approvalData;

                const empName = emp
                  ? emp.preferredName
                    ? `${emp.preferredName} ${emp.lastName}`
                    : `${emp.firstName} ${emp.lastName}`
                  : "Unknown";

                return (
                  <div
                    key={req.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/people/${emp?.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {empName}
                          </Link>
                          <Badge variant="secondary">{policy?.name}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(req.startDate)} - {formatDate(req.endDate)} (
                          {req.daysRequested} days)
                        </p>
                        {req.notes && (
                          <p className="text-sm text-muted-foreground italic">
                            Note: {req.notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Requested {formatDate(req.createdAt)}
                        </p>
                      </div>
                      <TimeOffActions requestId={req.id} />
                    </div>
                    
                    {approvalData && (
                      <div className="border-t pt-3">
                        <ApprovalStatus
                          steps={approvalData.steps}
                          currentStep={approvalData.request.currentStep}
                          overallStatus={approvalData.request.status}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No pending approvals
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
