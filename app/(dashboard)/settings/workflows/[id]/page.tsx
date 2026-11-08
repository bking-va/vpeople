import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { approvalWorkflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { WorkflowForm } from "@/components/workflow-form";
import { WorkflowSteps } from "@/components/workflow-steps";

export default async function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "full_admin")) {
    redirect("/settings");
  }

  const { id } = await params;
  const workflowId = parseInt(id);

  const [workflow] = await db
    .select()
    .from(approvalWorkflows)
    .where(eq(approvalWorkflows.id, workflowId));

  if (!workflow) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Approval Workflow</h1>
        <p className="text-muted-foreground">
          Configure approval settings for {workflow.name}
        </p>
      </div>

      <WorkflowForm workflow={workflow} />
      
      <WorkflowSteps workflowId={workflow.id} />
    </div>
  );
}
