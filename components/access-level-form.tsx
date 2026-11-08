"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface AccessLevel {
  id: number;
  code: string;
  name: string;
  canViewCompensation: boolean;
  canEditCompensation: boolean;
  canViewSensitivePersonalInfo: boolean;
  canEditSensitivePersonalInfo: boolean;
  canViewBankInfo: boolean;
  canEditBankInfo: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canApproveTimeOff: boolean;
  canApproveCompensationChanges: boolean;
}

interface AccessLevelFormProps {
  level: AccessLevel;
}

export function AccessLevelForm({ level }: AccessLevelFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState({
    canViewCompensation: level.canViewCompensation,
    canEditCompensation: level.canEditCompensation,
    canViewSensitivePersonalInfo: level.canViewSensitivePersonalInfo,
    canEditSensitivePersonalInfo: level.canEditSensitivePersonalInfo,
    canViewBankInfo: level.canViewBankInfo,
    canEditBankInfo: level.canEditBankInfo,
    canManageUsers: level.canManageUsers,
    canManageSettings: level.canManageSettings,
    canApproveTimeOff: level.canApproveTimeOff,
    canApproveCompensationChanges: level.canApproveCompensationChanges,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/settings/access-levels/${level.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(permissions),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update access level");
      }

      router.push("/settings/access-levels");
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
          <CardTitle>Compensation Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="canViewCompensation">View Compensation</Label>
            <Switch
              id="canViewCompensation"
              checked={permissions.canViewCompensation}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canViewCompensation: checked }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="canEditCompensation">Edit Compensation</Label>
            <Switch
              id="canEditCompensation"
              checked={permissions.canEditCompensation}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canEditCompensation: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="canViewSensitive">View Sensitive Info (SIN, etc.)</Label>
            <Switch
              id="canViewSensitive"
              checked={permissions.canViewSensitivePersonalInfo}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canViewSensitivePersonalInfo: checked }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="canEditSensitive">Edit Sensitive Info</Label>
            <Switch
              id="canEditSensitive"
              checked={permissions.canEditSensitivePersonalInfo}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canEditSensitivePersonalInfo: checked }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="canViewBank">View Bank Info</Label>
            <Switch
              id="canViewBank"
              checked={permissions.canViewBankInfo}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canViewBankInfo: checked }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="canEditBank">Edit Bank Info</Label>
            <Switch
              id="canEditBank"
              checked={permissions.canEditBankInfo}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canEditBankInfo: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="canManageUsers">Manage Users</Label>
            <Switch
              id="canManageUsers"
              checked={permissions.canManageUsers}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canManageUsers: checked }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="canManageSettings">Manage Settings</Label>
            <Switch
              id="canManageSettings"
              checked={permissions.canManageSettings}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canManageSettings: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="canApproveTimeOff">Approve Time Off</Label>
            <Switch
              id="canApproveTimeOff"
              checked={permissions.canApproveTimeOff}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canApproveTimeOff: checked }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="canApproveComp">Approve Compensation Changes</Label>
            <Switch
              id="canApproveComp"
              checked={permissions.canApproveCompensationChanges}
              onCheckedChange={(checked) =>
                setPermissions((p) => ({ ...p, canApproveCompensationChanges: checked }))
              }
            />
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
