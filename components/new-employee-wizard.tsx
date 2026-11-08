"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NewEmployeeWizardProps {
  departments: Array<{ id: number; name: string }>;
  divisions: Array<{ id: number; name: string }>;
  locations: Array<{ id: number; name: string; country: string }>;
  jobFamilies: Array<{ id: number; name: string }>;
  jobLevels: Array<{ id: number; code: string; name: string }>;
  managers: Array<{ id: number; firstName: string; lastName: string; jobTitle: string | null }>;
}

export function NewEmployeeWizard({
  departments,
  divisions,
  locations,
  jobFamilies,
  jobLevels,
  managers,
}: NewEmployeeWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    // Step 1: Basic Info
    firstName: "",
    lastName: "",
    email: "",
    hireDate: "",
    employmentStatus: "full_time",
    
    // Step 2: Job Info
    jobTitle: "",
    departmentId: "",
    divisionId: "",
    locationId: "",
    jobFamilyId: "",
    jobLevelId: "",
    
    // Step 3: Manager & Access
    managerId: "",
    accessLevel: "employee",
    workPhone: "",
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    if (step === 1) {
      return (
        formData.firstName &&
        formData.lastName &&
        formData.email &&
        formData.hireDate
      );
    }
    if (step === 2) {
      return (
        formData.jobTitle &&
        formData.departmentId &&
        formData.locationId
      );
    }
    if (step === 3) {
      return true; // Manager and access level are optional
    }
    return false;
  };

  const handleSubmit = async () => {
    if (!canProceed()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/employees/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/people/${data.employee.id}`);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to create employee");
      }
    } catch (error) {
      console.error("Failed to create employee:", error);
      alert("Failed to create employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { number: 1, title: "Basic Info" },
    { number: 2, title: "Job Info" },
    { number: 3, title: "Manager & Access" },
    { number: 4, title: "Review" },
  ];

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-between max-w-2xl mx-auto">
        {steps.map((s, idx) => (
          <div key={s.number} className="flex items-center flex-1">
            <div className="flex items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  step > s.number
                    ? "bg-primary border-primary text-primary-foreground"
                    : step === s.number
                    ? "border-primary text-primary"
                    : "border-muted-foreground text-muted-foreground"
                }`}
              >
                {step > s.number ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span>{s.number}</span>
                )}
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:inline">
                {s.title}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  step > s.number ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{steps[step - 1].title}</CardTitle>
          <CardDescription>
            {step === 1 && "Enter the employee's basic information"}
            {step === 2 && "Define the employee's role and location"}
            {step === 3 && "Assign manager and access level"}
            {step === 4 && "Review and submit"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hireDate">Hire Date *</Label>
                <Input
                  id="hireDate"
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => updateField("hireDate", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employmentStatus">Employment Status</Label>
                <Select
                  value={formData.employmentStatus}
                  onValueChange={(value) => updateField("employmentStatus", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Job Info */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jobTitle">Job Title *</Label>
                <Input
                  id="jobTitle"
                  value={formData.jobTitle}
                  onChange={(e) => updateField("jobTitle", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="departmentId">Department *</Label>
                <Select
                  value={formData.departmentId}
                  onValueChange={(value) => updateField("departmentId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={String(dept.id)}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="divisionId">Division</Label>
                <Select
                  value={formData.divisionId}
                  onValueChange={(value) => updateField("divisionId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select division (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {divisions.map((div) => (
                      <SelectItem key={div.id} value={String(div.id)}>
                        {div.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locationId">Location *</Label>
                <Select
                  value={formData.locationId}
                  onValueChange={(value) => updateField("locationId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.name} ({loc.country})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jobFamilyId">Job Family</Label>
                <Select
                  value={formData.jobFamilyId}
                  onValueChange={(value) => updateField("jobFamilyId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select job family (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobFamilies.map((family) => (
                      <SelectItem key={family.id} value={String(family.id)}>
                        {family.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jobLevelId">Job Level</Label>
                <Select
                  value={formData.jobLevelId}
                  onValueChange={(value) => updateField("jobLevelId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select job level (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobLevels.map((level) => (
                      <SelectItem key={level.id} value={String(level.id)}>
                        {level.code} - {level.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 3: Manager & Access */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="managerId">Manager</Label>
                <Select
                  value={formData.managerId}
                  onValueChange={(value) => updateField("managerId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manager (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((mgr) => (
                      <SelectItem key={mgr.id} value={String(mgr.id)}>
                        {mgr.firstName} {mgr.lastName}
                        {mgr.jobTitle && ` - ${mgr.jobTitle}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessLevel">Access Level</Label>
                <Select
                  value={formData.accessLevel}
                  onValueChange={(value) => updateField("accessLevel", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="regional_view">Regional View</SelectItem>
                    <SelectItem value="global_view">Global View</SelectItem>
                    <SelectItem value="full_admin">Full Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workPhone">Work Phone</Label>
                <Input
                  id="workPhone"
                  type="tel"
                  value={formData.workPhone}
                  onChange={(e) => updateField("workPhone", e.target.value)}
                  placeholder="+1-555-0100"
                />
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold">Basic Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    {formData.firstName} {formData.lastName}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    {formData.email}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Hire Date:</span>{" "}
                    {formData.hireDate}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    {formData.employmentStatus.replace("_", " ")}
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold">Job Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Title:</span>{" "}
                    {formData.jobTitle}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Department:</span>{" "}
                    {departments.find((d) => d.id === Number(formData.departmentId))?.name}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Location:</span>{" "}
                    {locations.find((l) => l.id === Number(formData.locationId))?.name}
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold">Management & Access</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Manager:</span>{" "}
                    {formData.managerId
                      ? (() => {
                          const mgr = managers.find((m) => m.id === Number(formData.managerId));
                          return mgr ? `${mgr.firstName} ${mgr.lastName}` : "Not assigned";
                        })()
                      : "Not assigned"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Access Level:</span>{" "}
                    {formData.accessLevel.replace("_", " ")}
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Upon submission, an onboarding task list will be automatically created
                  for this employee.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-6 border-t">
            {step > 1 ? (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                disabled={isSubmitting}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => router.push("/people")}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}

            {step < 4 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !canProceed()}
              >
                {isSubmitting ? "Creating..." : "Create Employee"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
