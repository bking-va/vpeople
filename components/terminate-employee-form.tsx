"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { roeLabel } from "@/lib/roe";

interface TerminateEmployeeFormProps {
  employee: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string | null;
  };
}

interface TerminationReason {
  id: number;
  name: string;
  category: string;
  roeCode: string;
  isActive: boolean;
}

export function TerminateEmployeeForm({ employee }: TerminateEmployeeFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reasons, setReasons] = useState<TerminationReason[]>([]);
  const [formData, setFormData] = useState({
    terminationDate: "",
    terminationType: "voluntary",
    terminationReasonId: "",
    notes: "",
  });

  useEffect(() => {
    fetch("/api/settings/termination-reasons")
      .then((r) => r.json())
      .then((data) => setReasons((data.terminationReasons || []).filter((row: TerminationReason) => row.isActive)))
      .catch(() => setReasons([]));
  }, []);

  const selectedReason = reasons.find(
    (row) => String(row.id) === formData.terminationReasonId
  );

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.terminationDate) {
      alert("Termination date is required");
      return;
    }
    if (!formData.terminationReasonId) {
      alert("Select a termination reason");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to terminate ${employee.firstName} ${employee.lastName}? This will trigger offboarding tasks and update their status.`
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/employees/${employee.id}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terminationDate: formData.terminationDate,
          terminationType: formData.terminationType,
          terminationReasonId: Number(formData.terminationReasonId),
          notes: formData.notes,
        }),
      });

      if (response.ok) {
        router.push(`/people/${employee.id}`);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to process termination");
      }
    } catch (error) {
      console.error("Failed to terminate employee:", error);
      alert("Failed to process termination");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Termination Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Important</p>
              <p>Terminating an employee will:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Update their status to &quot;Terminated&quot;</li>
                <li>Record a Canadian ROE code from the selected reason</li>
                <li>Create offboarding tasks</li>
                <li>Preserve history for reporting and possible rehire</li>
              </ul>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="terminationDate">Effective Date *</Label>
            <Input
              id="terminationDate"
              type="date"
              value={formData.terminationDate}
              onChange={(e) => updateField("terminationDate", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terminationType">Termination Type</Label>
            <Select
              value={formData.terminationType}
              onValueChange={(value) => updateField("terminationType", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="voluntary">Voluntary (Resignation)</SelectItem>
                <SelectItem value="involuntary">Involuntary (Termination)</SelectItem>
                <SelectItem value="retirement">Retirement</SelectItem>
                <SelectItem value="end_of_contract">End of Contract</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="terminationReasonId">Reason *</Label>
            <Select
              value={formData.terminationReasonId}
              onValueChange={(value) => updateField("terminationReasonId", value)}
            >
              <SelectTrigger id="terminationReasonId">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((reason) => (
                  <SelectItem key={reason.id} value={String(reason.id)}>
                    {reason.name} (ROE {reason.roeCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReason && (
              <p className="text-sm text-muted-foreground">
                Canadian ROE code {selectedReason.roeCode}
                {roeLabel(selectedReason.roeCode) ? ` — ${roeLabel(selectedReason.roeCode)}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Internal)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={4}
              placeholder="Internal notes about the termination..."
            />
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting || !formData.terminationDate || !formData.terminationReasonId}
            >
              {isSubmitting ? "Processing..." : "Process Termination"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
