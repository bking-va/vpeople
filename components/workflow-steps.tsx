"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface WorkflowStep {
  id: number;
  stepOrder: number;
  approverRole: string;
  requiredCount: number;
}

interface WorkflowStepsProps {
  workflowId: number;
}

export function WorkflowSteps({ workflowId }: WorkflowStepsProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newStepRole, setNewStepRole] = useState("manager");

  useEffect(() => {
    fetchSteps();
  }, [workflowId]);

  const fetchSteps = async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/steps`);
      if (response.ok) {
        const data = await response.json();
        setSteps(data.steps);
      }
    } catch (error) {
      console.error("Failed to fetch steps:", error);
    }
  };

  const addStep = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/workflows/${workflowId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepOrder: steps.length + 1,
          approverRole: newStepRole,
          requiredCount: 1,
        }),
      });

      if (response.ok) {
        await fetchSteps();
        setNewStepRole("manager");
      } else {
        alert("Failed to add step");
      }
    } catch (error) {
      console.error("Failed to add step:", error);
      alert("Failed to add step");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteStep = async (stepId: number) => {
    if (!confirm("Are you sure you want to delete this step?")) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/steps?stepId=${stepId}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        await fetchSteps();
      } else {
        alert("Failed to delete step");
      }
    } catch (error) {
      console.error("Failed to delete step:", error);
      alert("Failed to delete step");
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "manager":
        return "Direct Manager";
      case "manager_manager":
        return "Manager's Manager";
      case "admin":
        return "Admin";
      case "hr":
        return "HR";
      case "full_admin":
        return "Full Admin";
      default:
        return role;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval Steps</CardTitle>
        <CardDescription>
          Define the sequence of approvals required for this workflow
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.length > 0 ? (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">Step {step.stepOrder}</Badge>
                  <div>
                    <span className="font-medium">{getRoleLabel(step.approverRole)}</span>
                    {step.requiredCount > 1 && (
                      <span className="text-sm text-muted-foreground ml-2">
                        ({step.requiredCount} approvers required)
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteStep(step.id)}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No steps defined. Add steps below to create a multi-step approval workflow.
          </p>
        )}

        <div className="border-t pt-4 space-y-3">
          <Label htmlFor="newStepRole">Add Approval Step</Label>
          <div className="flex gap-2">
            <Select value={newStepRole} onValueChange={setNewStepRole}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Direct Manager</SelectItem>
                <SelectItem value="manager_manager">Manager&apos;s Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
                <SelectItem value="full_admin">Full Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addStep} disabled={isLoading}>
              <Plus className="mr-2 h-4 w-4" />
              Add Step
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Steps will be executed in order. Each step must be approved before moving to the next.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
