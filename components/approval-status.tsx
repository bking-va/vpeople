"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

interface ApprovalStep {
  step: {
    id: number;
    stepOrder: number;
    status: string;
    comments: string | null;
    reviewedAt: Date | null;
  };
  approver: {
    firstName: string;
    lastName: string;
  } | null;
}

interface ApprovalStatusProps {
  steps: ApprovalStep[];
  currentStep: number;
  overallStatus: string;
}

export function ApprovalStatus({ steps, currentStep, overallStatus }: ApprovalStatusProps) {
  if (!steps || steps.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Single-step approval (legacy)
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium">Approval Progress:</span>
        <Badge
          variant={
            overallStatus === "approved"
              ? "default"
              : overallStatus === "rejected"
              ? "destructive"
              : "secondary"
          }
        >
          {overallStatus === "approved" && "Approved"}
          {overallStatus === "rejected" && "Rejected"}
          {overallStatus === "pending" && `Step ${currentStep} of ${steps.length}`}
          {overallStatus === "cancelled" && "Cancelled"}
        </Badge>
      </div>

      <div className="space-y-2">
        {steps.map((step) => {
          const isCurrent = step.step.stepOrder === currentStep;
          const isCompleted = step.step.status === "approved";
          const isRejected = step.step.status === "rejected";

          return (
            <div
              key={step.step.id}
              className={`flex items-start gap-3 p-2 rounded-lg ${
                isCurrent ? "bg-muted" : ""
              }`}
            >
              <div className="mt-1">
                {isCompleted && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                {isRejected && <XCircle className="h-5 w-5 text-red-600" />}
                {!isCompleted && !isRejected && (
                  <Clock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    Step {step.step.stepOrder}
                  </span>
                  {step.approver && (
                    <span className="text-sm text-muted-foreground">
                      {step.approver.firstName} {step.approver.lastName}
                    </span>
                  )}
                  {!step.approver && (
                    <span className="text-sm text-muted-foreground italic">
                      Admin/HR approval required
                    </span>
                  )}
                </div>
                {step.step.reviewedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {isCompleted ? "Approved" : "Rejected"} on{" "}
                    {new Date(step.step.reviewedAt).toLocaleDateString()}
                  </p>
                )}
                {step.step.comments && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    &ldquo;{step.step.comments}&rdquo;
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
