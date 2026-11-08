"use client";

import { useState } from "react";
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

interface TerminateEmployeeFormProps {
  employee: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string | null;
  };
}

export function TerminateEmployeeForm({ employee }: TerminateEmployeeFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    terminationDate: "",
    terminationType: "voluntary",
    terminationReason: "",
    notes: "",
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.terminationDate) {
      alert("Termination date is required");
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
        body: JSON.stringify(formData),
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
              <p>
                Terminating an employee will:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Update their status to &quot;Terminated&quot;</li>
                <li>Create offboarding tasks</li>
                <li>Record the termination in audit logs</li>
                <li>Preserve their record for reporting purposes</li>
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
            <Label htmlFor="terminationReason">Reason</Label>
            <Input
              id="terminationReason"
              value={formData.terminationReason}
              onChange={(e) => updateField("terminationReason", e.target.value)}
              placeholder="e.g., Accepted position elsewhere, Performance issues"
            />
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
              disabled={isSubmitting || !formData.terminationDate}
            >
              {isSubmitting ? "Processing..." : "Process Termination"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
