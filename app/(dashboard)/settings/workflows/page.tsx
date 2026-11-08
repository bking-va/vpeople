import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { approvalWorkflows } from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { WorkflowToggle } from "@/components/workflow-toggle";

export default async function WorkflowsPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/");
  }

  const workflows = await db
    .select()
    .from(approvalWorkflows)
    .orderBy(approvalWorkflows.id);

  const workflowTypeLabels = {
    time_off: "Time Off",
    compensation_change: "Compensation Change",
    employment_status_change: "Employment Status Change",
    job_info_change: "Job Info Change",
    information_update: "Information Update",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Approval Workflows</h1>
          <p className="text-muted-foreground">
            Configure approval processes
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/settings">Back to Settings</Link>
        </Button>
      </div>

      <div className="space-y-4">
        {workflows.map((workflow) => (
          <Card key={workflow.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle>{workflow.name}</CardTitle>
                  <CardDescription>{workflow.description}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {workflowTypeLabels[workflow.type]}
                  </Badge>
                  <WorkflowToggle
                    workflowId={workflow.id}
                    enabled={workflow.enabled}
                  />
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/settings/workflows/${workflow.id}`}>Edit</Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {workflow.requiresManagerApproval ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-gray-300" />
                  )}
                  <span className="text-sm">Requires Manager Approval</span>
                </div>
                <div className="flex items-center gap-2">
                  {workflow.requiresAdminApproval ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-gray-300" />
                  )}
                  <span className="text-sm">Requires Admin Approval</span>
                </div>
                {workflow.autoApproveAfterDays && (
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">
                      Auto-approve after {workflow.autoApproveAfterDays} days
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow Enforcement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            When a workflow is enabled, it is enforced across the application:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
            <li>Time Off workflow controls approval of time-off requests</li>
            <li>Compensation Change workflow requires approvals for comp updates</li>
            <li>Job Info Change workflow applies to department, title, manager changes</li>
            <li>Disabled workflows allow changes without approval</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
