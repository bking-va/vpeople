"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateEmployeeEmploymentStatus } from "@/app/actions/employee";

export function EmploymentStatusForm({
  employeeId,
  currentStatus,
}: {
  employeeId: number;
  currentStatus: string;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState(
    currentStatus === "terminated" ? "full_time" : currentStatus
  );
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [changeReason, setChangeReason] = useState("");

  if (currentStatus === "terminated") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await updateEmployeeEmploymentStatus(employeeId, {
        employmentStatus: employmentStatus as "full_time" | "part_time" | "contractor" | "on_leave",
        effectiveDate,
        changeReason,
      });
      if (result.success) {
        if ("requiresApproval" in result && result.requiresApproval) {
          alert("Employment status change submitted for approval.");
        }
        router.refresh();
      } else {
        alert(result.error || "Failed to update status");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Employment Status</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>New status</Label>
              <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="statusEffectiveDate">Effective date</Label>
              <Input
                id="statusEffectiveDate"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="statusReason">Reason</Label>
            <Input
              id="statusReason"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="e.g. Return from leave"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Status changes go through the Employment Status approval workflow when it is enabled.
          </p>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Submitting..." : "Submit status change"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
