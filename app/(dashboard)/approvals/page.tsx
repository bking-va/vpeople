import { db } from "@/lib/db";
import {
  approvalRequests,
  approvalRequestSteps,
  employees,
  timeOffRequests,
  timeOffPolicies,
} from "@/lib/db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApprovalActions } from "@/components/approval-actions";

export default async function ApprovalsPage() {
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
    redirect("/");
  }

  // Get pending approval requests where current employee is an approver
  // Either specific approverId or null (for admin/HR roles)
  const pendingSteps = await db
    .select({
      step: approvalRequestSteps,
      request: approvalRequests,
      requester: employees,
    })
    .from(approvalRequestSteps)
    .innerJoin(
      approvalRequests,
      eq(approvalRequestSteps.approvalRequestId, approvalRequests.id)
    )
    .innerJoin(employees, eq(approvalRequests.requesterId, employees.id))
    .where(
      and(
        eq(approvalRequestSteps.status, "pending"),
        eq(approvalRequests.status, "pending"),
        or(
          eq(approvalRequestSteps.approverId, employeeId),
          and(
            sql`${approvalRequestSteps.approverId} IS NULL`,
            isAdmin
              ? sql`true`
              : sql`false`
          )
        )
      )
    )
    .orderBy(approvalRequests.createdAt);

  // Enrich requests with entity-specific data
  const enrichedRequests = await Promise.all(
    pendingSteps.map(async (item) => {
      let entityData: any = null;

      if (item.request.entityType === "time_off_request") {
        const [timeOffData] = await db
          .select({
            request: timeOffRequests,
            employee: employees,
            policy: timeOffPolicies,
          })
          .from(timeOffRequests)
          .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
          .leftJoin(
            timeOffPolicies,
            eq(timeOffRequests.policyId, timeOffPolicies.id)
          )
          .where(eq(timeOffRequests.id, item.request.entityId))
          .limit(1);
        entityData = timeOffData;
      } else if (
        item.request.entityType === "compensation_change" ||
        item.request.entityType === "job_info_change"
      ) {
        const [affectedEmployee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, item.request.entityId))
          .limit(1);
        entityData = { employee: affectedEmployee, metadata: item.request.metadata };
      }

      return {
        ...item,
        entityData,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Approvals</h1>
        <p className="text-muted-foreground">
          Review and approve pending requests
        </p>
      </div>

      {enrichedRequests.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground text-center">
              No pending approvals at this time
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {enrichedRequests.map((item) => (
            <Card key={item.request.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      {item.request.entityType === "time_off_request" && "Time Off Request"}
                      {item.request.entityType === "compensation_change" &&
                        "Compensation Change"}
                      {item.request.entityType === "job_info_change" && "Job Info Change"}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Requested by {item.requester.firstName} {item.requester.lastName}
                      {" • "}
                      {formatDate(item.request.createdAt.toISOString())}
                    </p>
                  </div>
                  <Badge variant="outline">
                    Step {item.step.stepOrder}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {item.request.entityType === "time_off_request" &&
                    item.entityData && (
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Employee:</span>{" "}
                          <span className="font-medium">
                            {item.entityData.employee?.firstName}{" "}
                            {item.entityData.employee?.lastName}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Policy:</span>{" "}
                          <span className="font-medium">
                            {item.entityData.policy?.name}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Start Date:</span>{" "}
                          <span className="font-medium">
                            {formatDate(item.entityData.request.startDate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">End Date:</span>{" "}
                          <span className="font-medium">
                            {formatDate(item.entityData.request.endDate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Days Requested:</span>{" "}
                          <span className="font-medium">
                            {item.entityData.request.daysRequested}
                          </span>
                        </div>
                        {item.entityData.request.notes && (
                          <div className="md:col-span-2">
                            <span className="text-muted-foreground">Notes:</span>{" "}
                            <span className="font-medium">
                              {item.entityData.request.notes}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                  {item.request.entityType === "compensation_change" &&
                    item.entityData && (
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Employee:</span>{" "}
                          <span className="font-medium">
                            {item.entityData.employee?.firstName}{" "}
                            {item.entityData.employee?.lastName}
                          </span>
                        </div>
                        {item.entityData.metadata?.payRate && (
                          <div>
                            <span className="text-muted-foreground">New Pay Rate:</span>{" "}
                            <span className="font-medium">
                              {formatCurrency(
                                parseFloat(item.entityData.metadata.payRate),
                                item.entityData.metadata.currency || "CAD"
                              )}
                            </span>
                          </div>
                        )}
                        {item.entityData.metadata?.payType && (
                          <div>
                            <span className="text-muted-foreground">Pay Type:</span>{" "}
                            <span className="font-medium">
                              {item.entityData.metadata.payType}
                            </span>
                          </div>
                        )}
                        {item.entityData.metadata?.effectiveDate && (
                          <div>
                            <span className="text-muted-foreground">Effective Date:</span>{" "}
                            <span className="font-medium">
                              {formatDate(item.entityData.metadata.effectiveDate)}
                            </span>
                          </div>
                        )}
                        {item.entityData.metadata?.changeReason && (
                          <div className="md:col-span-2">
                            <span className="text-muted-foreground">Reason:</span>{" "}
                            <span className="font-medium">
                              {item.entityData.metadata.changeReason}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                  {item.request.entityType === "job_info_change" &&
                    item.entityData && (
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Employee:</span>{" "}
                          <span className="font-medium">
                            {item.entityData.employee?.firstName}{" "}
                            {item.entityData.employee?.lastName}
                          </span>
                        </div>
                        {item.entityData.metadata?.jobTitle && (
                          <div>
                            <span className="text-muted-foreground">New Job Title:</span>{" "}
                            <span className="font-medium">
                              {item.entityData.metadata.jobTitle}
                            </span>
                          </div>
                        )}
                        {item.entityData.metadata?.effectiveDate && (
                          <div>
                            <span className="text-muted-foreground">Effective Date:</span>{" "}
                            <span className="font-medium">
                              {formatDate(item.entityData.metadata.effectiveDate)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                  <ApprovalActions
                    requestId={item.request.id}
                    stepOrder={item.step.stepOrder}
                    entityType={item.request.entityType}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
