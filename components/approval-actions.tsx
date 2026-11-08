"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";

interface ApprovalActionsProps {
  requestId: number;
  stepOrder: number;
  entityType: string;
}

export function ApprovalActions({
  requestId,
  stepOrder,
  entityType,
}: ApprovalActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [comments, setComments] = useState("");

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/approvals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          stepOrder,
          comments,
        }),
      });

      if (response.ok) {
        router.refresh();
        setComments("");
      } else {
        const data = await response.json();
        alert(data.error || "Failed to approve request");
      }
    } catch (error) {
      console.error("Failed to approve:", error);
      alert("Failed to approve request");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/approvals/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          stepOrder,
          comments,
        }),
      });

      if (response.ok) {
        router.refresh();
        setComments("");
      } else {
        const data = await response.json();
        alert(data.error || "Failed to reject request");
      }
    } catch (error) {
      console.error("Failed to reject:", error);
      alert("Failed to reject request");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-2">
        <Label htmlFor={`comments-${requestId}`}>Comments (optional)</Label>
        <Textarea
          id={`comments-${requestId}`}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Add any comments..."
          rows={2}
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleApprove}
          disabled={isLoading}
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-2" />
          Approve
        </Button>
        <Button
          onClick={handleReject}
          disabled={isLoading}
          variant="destructive"
          className="flex-1"
        >
          <X className="h-4 w-4 mr-2" />
          Reject
        </Button>
      </div>
    </div>
  );
}
