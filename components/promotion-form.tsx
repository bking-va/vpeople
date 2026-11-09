"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { promoteEmployee } from "@/app/actions/employee";

export function PromotionForm({
  employeeId,
  currentTitle,
}: {
  employeeId: number;
  currentTitle: string | null;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [jobTitle, setJobTitle] = useState(currentTitle || "");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [changeReason, setChangeReason] = useState("Promotion");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim()) {
      alert("New job title is required");
      return;
    }
    setIsLoading(true);
    try {
      const result = await promoteEmployee(employeeId, {
        jobTitle: jobTitle.trim(),
        effectiveDate,
        changeReason,
      });
      if (result.success) {
        if ("requiresApproval" in result && result.requiresApproval) {
          alert("Promotion submitted for approval.");
        }
        router.refresh();
      } else {
        alert(result.error || "Failed to submit promotion");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Promotion</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="promoTitle">New job title</Label>
              <Input
                id="promoTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promoDate">Effective date</Label>
              <Input
                id="promoDate"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="promoReason">Reason</Label>
            <Input
              id="promoReason"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Promotions go through the Promotion approval workflow when it is enabled. Self-approval is blocked.
          </p>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Submitting..." : "Submit promotion"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
