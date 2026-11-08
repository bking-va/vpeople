"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface OfferLetterFormProps {
  candidateId: number;
  candidateName: string;
  defaultJobTitle: string;
  existingOffer?: {
    id: number;
    jobTitle: string;
    salary: string | null;
    startDate: string | null;
    signedAt: Date | null;
  };
}

export function OfferLetterForm({
  candidateId,
  candidateName,
  defaultJobTitle,
  existingOffer,
}: OfferLetterFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      jobTitle: formData.get("jobTitle") as string,
      salary: formData.get("salary") as string,
      startDate: formData.get("startDate") as string,
    };

    try {
      const url = existingOffer
        ? `/api/hiring/offers/${existingOffer.id}`
        : "/api/hiring/offers";
      const method = existingOffer ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, candidateId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save offer letter");
      }

      router.push(`/hiring/candidates/${candidateId}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Offer Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Job Title *</Label>
            <Input
              id="jobTitle"
              name="jobTitle"
              defaultValue={existingOffer?.jobTitle || defaultJobTitle}
              required
              placeholder="e.g. Senior Software Engineer"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="salary">Annual Salary *</Label>
            <Input
              id="salary"
              name="salary"
              type="number"
              step="1000"
              defaultValue={existingOffer?.salary || ""}
              required
              placeholder="e.g. 120000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date *</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={existingOffer?.startDate || ""}
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : existingOffer ? "Update Offer" : "Create Offer"}
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
      </CardContent>
    </Card>
  );
}
