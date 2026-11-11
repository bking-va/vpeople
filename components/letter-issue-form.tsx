"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LetterIssueForm({ templateId }: { templateId: number }) {
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/letter-templates/${templateId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: parseInt(employeeId, 10) }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Issue failed");
      }
      setMessage(`Issued document #${body.document?.id} (pending signature)`);
      setEmployeeId("");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Issue failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 mt-4">
      <div className="space-y-1">
        <Label htmlFor={`employee-${templateId}`}>Employee ID</Label>
        <Input
          id={`employee-${templateId}`}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          required
          inputMode="numeric"
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Issuing…" : "Issue letter"}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}
