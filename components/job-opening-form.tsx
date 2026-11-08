"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface JobOpeningFormProps {
  departments: Array<{ id: number; name: string }>;
  locations: Array<{ id: number; name: string }>;
  hiringLeads: Array<{ id: number; firstName: string; lastName: string; email: string }>;
  opening?: {
    id: number;
    title: string;
    departmentId: number | null;
    locationId: number | null;
    hiringLeadId: number | null;
    status: string;
    employmentType: string;
    description: string | null;
    requirements: string | null;
    openDate: string | null;
  };
}

export function JobOpeningForm({ departments, locations, hiringLeads, opening }: JobOpeningFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get("title") as string,
      departmentId: formData.get("departmentId") ? parseInt(formData.get("departmentId") as string) : null,
      locationId: formData.get("locationId") ? parseInt(formData.get("locationId") as string) : null,
      hiringLeadId: formData.get("hiringLeadId") ? parseInt(formData.get("hiringLeadId") as string) : null,
      status: formData.get("status") as string,
      employmentType: formData.get("employmentType") as string,
      description: formData.get("description") as string,
      requirements: formData.get("requirements") as string,
      openDate: formData.get("openDate") as string || null,
    };

    try {
      const url = opening
        ? `/api/hiring/openings/${opening.id}`
        : "/api/hiring/openings";
      const method = opening ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save job opening");
      }

      const result = await response.json();
      router.push(`/hiring/openings/${result.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{opening ? "Edit" : "Create"} Job Opening</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Job Title *</Label>
            <Input
              id="title"
              name="title"
              defaultValue={opening?.title}
              required
              placeholder="e.g. Senior Software Engineer"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="departmentId">Department</Label>
              <Select name="departmentId" defaultValue={opening?.departmentId?.toString()}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id.toString()}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locationId">Location</Label>
              <Select name="locationId" defaultValue={opening?.locationId?.toString()}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id.toString()}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employmentType">Employment Type *</Label>
              <Select name="employmentType" defaultValue={opening?.employmentType || "full_time"} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full Time</SelectItem>
                  <SelectItem value="part_time">Part Time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select name="status" defaultValue={opening?.status || "draft"} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="filled">Filled</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hiringLeadId">Hiring Lead</Label>
            <Select name="hiringLeadId" defaultValue={opening?.hiringLeadId?.toString()}>
              <SelectTrigger>
                <SelectValue placeholder="Select hiring lead" />
              </SelectTrigger>
              <SelectContent>
                {hiringLeads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id.toString()}>
                    {lead.firstName} {lead.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="openDate">Open Date</Label>
            <Input
              id="openDate"
              name="openDate"
              type="date"
              defaultValue={opening?.openDate || ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Job Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={opening?.description || ""}
              rows={6}
              placeholder="Describe the role, responsibilities, and what the candidate will be doing..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirements">Requirements</Label>
            <Textarea
              id="requirements"
              name="requirements"
              defaultValue={opening?.requirements || ""}
              rows={6}
              placeholder="List required skills, experience, education, certifications..."
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : opening ? "Update Opening" : "Create Opening"}
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
