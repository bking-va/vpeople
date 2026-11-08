"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Policy {
  id: number;
  name: string;
  policyType: string;
  country: string | null;
  accrualRate: string | null;
  accrualPeriod: string | null;
  maxCarryover: string | null;
  maxBalance: string | null;
  requiresApproval: boolean | null;
  description: string | null;
}

export function TimeOffPolicyList({ policies }: { policies: Policy[] }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState<number | null>(null);

  const handleDelete = async (policyId: number) => {
    if (!confirm("Delete this time-off policy? It cannot be deleted if employees have active balances.")) {
      return;
    }
    setIsDeleting(policyId);
    try {
      const response = await fetch(`/api/settings/time-off-policies/${policyId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete policy");
      }
      router.refresh();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsDeleting(null);
    }
  };

  if (policies.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No policies configured yet. Create your first policy to get started.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {policies.map((policy) => (
        <div
          key={policy.id}
          className="flex items-center justify-between border rounded-lg p-3"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{policy.name}</span>
              <Badge variant="outline">{policy.policyType}</Badge>
              <Badge variant={policy.requiresApproval ? "default" : "secondary"}>
                {policy.requiresApproval ? "Approval required" : "No approval"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {policy.country || "All countries"}
              {policy.accrualRate && policy.accrualPeriod
                ? ` · ${policy.accrualRate} / ${policy.accrualPeriod}`
                : ""}
              {policy.maxBalance ? ` · max ${parseFloat(policy.maxBalance).toFixed(1)} days` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/settings/time-off-policies/${policy.id}/edit`)}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDelete(policy.id)}
              disabled={isDeleting === policy.id}
            >
              {isDeleting === policy.id ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
