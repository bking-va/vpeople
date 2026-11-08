"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface CandidateRatingProps {
  candidateId: number;
  currentRating: number | null;
}

export function CandidateRating({
  candidateId,
  currentRating,
}: CandidateRatingProps) {
  const router = useRouter();
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRatingClick = async (rating: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/hiring/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });

      if (!response.ok) {
        throw new Error("Failed to update rating");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to update rating:", error);
      alert("Failed to update rating");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled =
          star <= (hoveredRating ?? currentRating ?? 0);
        return (
          <button
            key={star}
            type="button"
            disabled={loading}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(null)}
            onClick={() => handleRatingClick(star)}
            className="focus:outline-none disabled:opacity-50"
          >
            <Star
              className={cn(
                "h-6 w-6 transition-colors",
                isFilled
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
