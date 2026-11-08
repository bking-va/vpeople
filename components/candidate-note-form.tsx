"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CandidateNoteFormProps {
  candidateId: number;
}

export function CandidateNoteForm({ candidateId }: CandidateNoteFormProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/hiring/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error("Failed to add note");
      }

      setContent("");
      router.refresh();
    } catch (error) {
      console.error("Failed to add note:", error);
      alert("Failed to add note");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        placeholder="Add a note about this candidate..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        disabled={loading}
      />
      <Button type="submit" disabled={loading || !content.trim()}>
        {loading ? "Adding..." : "Add Note"}
      </Button>
    </form>
  );
}
