"use client";

import { useState, useEffect } from "react";
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
import { updateEmployeeJobInfo } from "@/app/actions/employee";

interface JobInfoEditFormProps {
  employeeId: number;
  canEdit: boolean;
  currentData: {
    jobTitle?: string;
    departmentId?: number;
    divisionId?: number;
    locationId?: number;
    managerId?: number;
    employmentStatus?: string;
    jobFamilyId?: number;
    jobLevelId?: number;
  };
}

export function JobInfoEditForm({ employeeId, canEdit, currentData }: JobInfoEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [jobFamilies, setJobFamilies] = useState<any[]>([]);
  const [jobLevels, setJobLevels] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    jobTitle: currentData.jobTitle || "",
    departmentId: currentData.departmentId?.toString() || "",
    divisionId: currentData.divisionId?.toString() || "",
    locationId: currentData.locationId?.toString() || "",
    managerId: currentData.managerId?.toString() || "",
    employmentStatus: currentData.employmentStatus || "full_time",
    jobFamilyId: currentData.jobFamilyId?.toString() || "",
    jobLevelId: currentData.jobLevelId?.toString() || "",
  });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [depts, divs, locs, emps] = await Promise.all([
          fetch("/api/departments").then((r) => r.json()),
          fetch("/api/departments").then((r) => r.json()), // placeholder for divisions
          fetch("/api/departments").then((r) => r.json()), // placeholder for locations
          fetch("/api/employees").then((r) => r.json()),
        ]);
        setDepartments(Array.isArray(depts) ? depts : []);
        setDivisions([]);
        setLocations([]);
        setEmployees(Array.isArray(emps) ? emps : []);
        setJobFamilies([]);
        setJobLevels([]);
      } catch (error) {
        console.error("Failed to fetch options:", error);
      }
    };
    if (canEdit) {
      fetchOptions();
    }
  }, [canEdit]);

  if (!canEdit) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await updateEmployeeJobInfo(employeeId, {
        jobTitle: formData.jobTitle || undefined,
        departmentId: formData.departmentId ? parseInt(formData.departmentId) : undefined,
        divisionId: formData.divisionId ? parseInt(formData.divisionId) : undefined,
        locationId: formData.locationId ? parseInt(formData.locationId) : undefined,
        managerId: formData.managerId ? parseInt(formData.managerId) : undefined,
        employmentStatus: formData.employmentStatus as any,
        jobFamilyId: formData.jobFamilyId ? parseInt(formData.jobFamilyId) : undefined,
        jobLevelId: formData.jobLevelId ? parseInt(formData.jobLevelId) : undefined,
      });

      if (result.success) {
        if (result.requiresApproval) {
          alert("Job info change submitted for approval. Request ID: " + result.approvalRequestId);
        }
        router.refresh();
      } else {
        alert(result.error || "Failed to update job information");
      }
    } catch (error) {
      console.error("Failed to update job information:", error);
      alert("Failed to update job information");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update Job Information</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input
                id="jobTitle"
                type="text"
                value={formData.jobTitle}
                onChange={(e) =>
                  setFormData({ ...formData, jobTitle: e.target.value })
                }
                placeholder="e.g., Senior Software Engineer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="employmentStatus">Employment Status</Label>
              <Select
                value={formData.employmentStatus}
                onValueChange={(value) =>
                  setFormData({ ...formData, employmentStatus: value })
                }
              >
                <SelectTrigger id="employmentStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="departmentId">Department</Label>
              <Select
                value={formData.departmentId}
                onValueChange={(value) =>
                  setFormData({ ...formData, departmentId: value })
                }
              >
                <SelectTrigger id="departmentId">
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
              <Label htmlFor="managerId">Manager</Label>
              <Select
                value={formData.managerId}
                onValueChange={(value) =>
                  setFormData({ ...formData, managerId: value })
                }
              >
                <SelectTrigger id="managerId">
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((emp) => emp.id !== employeeId)
                    .map((emp) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            Note: Significant job changes may require approval based on configured workflows.
          </div>

          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Submitting..." : "Update Job Information"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
