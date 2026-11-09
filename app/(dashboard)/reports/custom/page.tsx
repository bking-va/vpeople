"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Play, Save, Clock } from "lucide-react";
import { useRouter } from "next/navigation";

const availableFields = [
  { id: "employeeNumber", label: "Employee Number", category: "Basic" },
  { id: "firstName", label: "First Name", category: "Basic" },
  { id: "lastName", label: "Last Name", category: "Basic" },
  { id: "email", label: "Email", category: "Basic" },
  { id: "jobTitle", label: "Job Title", category: "Job" },
  { id: "department", label: "Department", category: "Job" },
  { id: "division", label: "Division", category: "Job" },
  { id: "location", label: "Location", category: "Job" },
  { id: "hireDate", label: "Hire Date", category: "Employment" },
  { id: "employmentStatus", label: "Status", category: "Employment" },
  { id: "workPhone", label: "Work Phone", category: "Contact" },
  { id: "mobilePhone", label: "Mobile Phone", category: "Contact" },
];

const groupByOptions = [
  { value: "none", label: "No grouping" },
  { value: "department", label: "Department" },
  { value: "division", label: "Division" },
  { value: "location", label: "Location" },
  { value: "employmentStatus", label: "Employment Status" },
];

export default function CustomReportPage() {
  const router = useRouter();
  const [selectedFields, setSelectedFields] = useState<string[]>([
    "employeeNumber",
    "firstName",
    "lastName",
    "email",
    "jobTitle",
    "department",
  ]);
  const [groupBy, setGroupBy] = useState("none");
  const [employmentStatus, setEmploymentStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [hireDateFrom, setHireDateFrom] = useState("");
  const [hireDateTo, setHireDateTo] = useState("");
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const toggleField = (fieldId: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId)
        ? prev.filter((id) => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handlePreview = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        fields: selectedFields.join(","),
        groupBy,
        employmentStatus,
        search,
        hireDateFrom,
        hireDateTo,
      });
      const response = await fetch(`/api/reports/preview?${params}`);
      const data = await response.json();
      setPreviewData(data.rows || []);
    } catch (error) {
      console.error("Preview failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams({
      type: "custom",
      fields: selectedFields.join(","),
      groupBy,
      employmentStatus,
      search,
      hireDateFrom,
      hireDateTo,
    });
    window.location.href = `/api/reports/export?${params}`;
  };

  const handleSaveReport = async () => {
    if (!reportName.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/reports/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reportName,
          description: reportDescription,
          fields: selectedFields,
          groupBy: groupBy !== "none" ? groupBy : null,
          isShared: false,
        }),
      });

      if (response.ok) {
        setShowSaveDialog(false);
        setReportName("");
        setReportDescription("");
        alert("Report saved successfully!");
      } else {
        alert("Failed to save report");
      }
    } catch (error) {
      console.error("Save failed:", error);
      alert("Failed to save report");
    } finally {
      setIsSaving(false);
    }
  };

  const fieldsByCategory = availableFields.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, typeof availableFields>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Custom Report Builder</h1>
        <p className="text-muted-foreground">
          Select fields, apply filters, and export your custom report
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Field Selector</CardTitle>
            <CardDescription>Choose which fields to include</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(fieldsByCategory).map(([category, fields]) => (
              <div key={category} className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground">
                  {category}
                </h3>
                <div className="space-y-2">
                  {fields.map((field) => (
                    <div key={field.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={field.id}
                        checked={selectedFields.includes(field.id)}
                        onCheckedChange={() => toggleField(field.id)}
                      />
                      <Label
                        htmlFor={field.id}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {field.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Report Configuration</CardTitle>
            <CardDescription>
              Configure grouping and preview your report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employment status</Label>
                <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="full_time">Full-time</SelectItem>
                    <SelectItem value="part_time">Part-time</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                    <SelectItem value="on_leave">On leave</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Search</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email, title, number"
                />
              </div>
              <div className="space-y-2">
                <Label>Hire date from</Label>
                <Input type="date" value={hireDateFrom} onChange={(e) => setHireDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hire date to</Label>
                <Input type="date" value={hireDateTo} onChange={(e) => setHireDateTo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Group By</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupByOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button onClick={handlePreview} disabled={isLoading}>
                <Play className="mr-2 h-4 w-4" />
                Preview
              </Button>
              <Button
                onClick={handleExport}
                variant="outline"
                disabled={selectedFields.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                onClick={() => setShowSaveDialog(true)}
                variant="outline"
                disabled={selectedFields.length === 0}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Report
              </Button>
            </div>

            {previewData && (
              <div className="mt-6">
                <h3 className="font-medium mb-2">
                  Preview ({previewData.length} rows)
                </h3>
                <div className="rounded-md border overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {selectedFields.map((fieldId) => {
                          const field = availableFields.find(
                            (f) => f.id === fieldId
                          );
                          return (
                            <th
                              key={fieldId}
                              className="px-3 py-2 text-left font-medium"
                            >
                              {field?.label}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {previewData.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-muted/50">
                          {selectedFields.map((fieldId) => (
                            <td key={fieldId} className="px-3 py-2">
                              {row[fieldId] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewData.length > 10 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Showing first 10 of {previewData.length} rows
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Report</DialogTitle>
            <DialogDescription>
              Save this report configuration for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reportName">Report Name</Label>
              <Input
                id="reportName"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g., Sales Team Contact List"
              />
            </div>
            <div>
              <Label htmlFor="reportDescription">Description (optional)</Label>
              <Textarea
                id="reportDescription"
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Describe what this report is for..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveReport} disabled={isSaving || !reportName.trim()}>
              {isSaving ? "Saving..." : "Save Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
