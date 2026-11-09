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

interface RehireEmployeeFormProps {
  employee: {
    id: number;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    hireDate: string | null;
    originalHireDate: string | null;
    terminationDate: string | null;
  };
}

export function RehireEmployeeForm({ employee }: RehireEmployeeFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    hireDate: "",
    employmentStatus: "full_time",
    jobTitle: employee.jobTitle || "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.hireDate) {
      alert("New hire date is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/employees/${employee.id}/rehire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        router.push(`/people/${employee.id}`);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to rehire employee");
      }
    } catch (error) {
      console.error("Failed to rehire employee:", error);
      alert("Failed to rehire employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Rehire Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Original hire date {employee.originalHireDate || employee.hireDate || "—"} is
            preserved. Previous termination on {employee.terminationDate || "—"} stays in
            employment status history.
          </p>
          <div className="space-y-2">
            <Label htmlFor="hireDate">New hire date *</Label>
            <Input
              id="hireDate"
              type="date"
              value={formData.hireDate}
              onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Employment status</Label>
            <Select
              value={formData.employmentStatus}
              onValueChange={(value) => setFormData({ ...formData, employmentStatus: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full-time</SelectItem>
                <SelectItem value="part_time">Part-time</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Job title</Label>
            <Input
              id="jobTitle"
              value={formData.jobTitle}
              onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
          <div className="flex gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.hireDate}>
              {isSubmitting ? "Rehiring..." : "Rehire employee"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
