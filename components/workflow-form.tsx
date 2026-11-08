"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Workflow {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  requiresManagerApproval: boolean;
  requiresAdminApproval: boolean;
  autoApproveAfterDays: number | null;
  description: string | null;
}

interface WorkflowFormProps {
  workflow: Workflow;
}

export function WorkflowForm({ workflow }: WorkflowFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: workflow.name,
    enabled: workflow.enabled,
    requiresManagerApproval: workflow.requiresManagerApproval,
    requiresAdminApproval: workflow.requiresAdminApproval,
    autoApproveAfterDays: workflow.autoApproveAfterDays?.toString() || "",
    description: workflow.description || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/settings/workflows/${workflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          autoApproveAfterDays: formData.autoApproveAfterDays
            ? parseInt(formData.autoApproveAfterDays)
            : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update workflow");
      }

      router.push("/settings/workflows");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workflow Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((d) => ({ ...d, name: e.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((d) => ({ ...d, description: e.target.value }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="enabled">Enabled</Label>
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) =>
                setFormData((d) => ({ ...d, enabled: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="requiresManager">Requires Manager Approval</Label>
              <p className="text-sm text-muted-foreground">
                Request must be approved by employee&apos;s manager
              </p>
            </div>
            <Switch
              id="requiresManager"
              checked={formData.requiresManagerApproval}
              onCheckedChange={(checked) =>
                setFormData((d) => ({ ...d, requiresManagerApproval: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="requiresAdmin">Requires Admin Approval</Label>
              <p className="text-sm text-muted-foreground">
                Request must also be approved by HR/admin
              </p>
            </div>
            <Switch
              id="requiresAdmin"
              checked={formData.requiresAdminApproval}
              onCheckedChange={(checked) =>
                setFormData((d) => ({ ...d, requiresAdminApproval: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="autoApprove">Auto-Approve After (Days)</Label>
            <Input
              id="autoApprove"
              type="number"
              min="0"
              placeholder="Leave empty to disable"
              value={formData.autoApproveAfterDays}
              onChange={(e) =>
                setFormData((d) => ({ ...d, autoApproveAfterDays: e.target.value }))
              }
            />
            <p className="text-sm text-muted-foreground">
              Automatically approve if not acted upon within this many days
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
