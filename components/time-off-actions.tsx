"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { approveTimeOffRequest, denyTimeOffRequest } from "@/app/actions/time-off";
import { useRouter } from "next/navigation";

export function TimeOffActions({ requestId }: { requestId: number }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const result = await approveTimeOffRequest(requestId);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error || "Failed to approve request");
      }
    } catch (error) {
      alert("An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = async () => {
    const reason = prompt("Reason for denial (optional):");
    setIsLoading(true);
    try {
      const result = await denyTimeOffRequest(requestId, reason || undefined);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error || "Failed to deny request");
      }
    } catch (error) {
      alert("An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleApprove}
        disabled={isLoading}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={handleDeny}
        disabled={isLoading}
      >
        Deny
      </Button>
    </div>
  );
}
