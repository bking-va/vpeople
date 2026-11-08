"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface WorkflowToggleProps {
  workflowId: number;
  enabled: boolean;
}

export function WorkflowToggle({ workflowId, enabled }: WorkflowToggleProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/settings/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update workflow");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to update workflow:", error);
      alert("Failed to update workflow");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleToggle} disabled={loading}>
      <Badge variant={enabled ? "default" : "outline"}>
        {loading ? "..." : enabled ? "Enabled" : "Disabled"}
      </Badge>
    </button>
  );
}
