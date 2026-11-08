"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CandidateStageSelectorProps {
  candidateId: number;
  currentStage: string;
}

export function CandidateStageSelector({
  candidateId,
  currentStage,
}: CandidateStageSelectorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const stages = [
    { value: "new", label: "New" },
    { value: "phone_screen", label: "Phone Screen" },
    { value: "interview", label: "Interview" },
    { value: "offer", label: "Offer" },
    { value: "hired", label: "Hired" },
    { value: "rejected", label: "Rejected" },
  ];

  const handleStageChange = async (newStage: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/hiring/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });

      if (!response.ok) {
        throw new Error("Failed to update stage");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to update stage:", error);
      alert("Failed to update stage");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select
      value={currentStage}
      onValueChange={handleStageChange}
      disabled={loading}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {stages.map((stage) => (
          <SelectItem key={stage.value} value={stage.value}>
            {stage.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
