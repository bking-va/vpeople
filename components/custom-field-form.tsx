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
import { Checkbox } from "@/components/ui/checkbox";

interface CustomField {
  id: number;
  name: string;
  fieldType: string;
  entityType: string;
  section: string | null;
  options: string | null;
  isRequired: boolean;
  orderIndex: number | null;
}

interface CustomFieldFormProps {
  field?: CustomField;
}

export function CustomFieldForm({ field }: CustomFieldFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: field?.name || "",
    fieldType: field?.fieldType || "text",
    entityType: field?.entityType || "employee",
    section: field?.section || "personal",
    options: field?.options || "",
    isRequired: field?.isRequired || false,
    orderIndex: field?.orderIndex || 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const url = field
        ? `/api/custom-fields/${field.id}`
        : "/api/custom-fields";
      const method = field ? "PATCH" : "POST";

      const body: any = {
        name: formData.name,
        fieldType: formData.fieldType,
        entityType: formData.entityType,
        section: formData.section,
        isRequired: formData.isRequired,
        orderIndex: formData.orderIndex,
      };

      // Parse options if field type is select
      if (formData.fieldType === "select" && formData.options) {
        try {
          body.options = formData.options
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean);
        } catch {
          body.options = [];
        }
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        router.push("/settings/custom-fields");
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to save custom field");
      }
    } catch (error) {
      console.error("Failed to save custom field:", error);
      alert("Failed to save custom field");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!field) return;
    if (!confirm("Are you sure you want to delete this custom field?")) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/custom-fields/${field.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/settings/custom-fields");
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete custom field");
      }
    } catch (error) {
      console.error("Failed to delete custom field:", error);
      alert("Failed to delete custom field");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{field ? "Edit" : "Create"} Custom Field</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Field Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              placeholder="e.g. T-Shirt Size"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fieldType">Field Type *</Label>
            <Select
              value={formData.fieldType}
              onValueChange={(value) =>
                setFormData({ ...formData, fieldType: value })
              }
            >
              <SelectTrigger id="fieldType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="textarea">Text Area</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="select">Select Dropdown</SelectItem>
                <SelectItem value="checkbox">Checkbox</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.fieldType === "select" && (
            <div className="space-y-2">
              <Label htmlFor="options">Options (one per line) *</Label>
              <Textarea
                id="options"
                value={formData.options}
                onChange={(e) =>
                  setFormData({ ...formData, options: e.target.value })
                }
                placeholder="Small&#10;Medium&#10;Large&#10;X-Large"
                rows={5}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="section">Profile Section *</Label>
            <Select
              value={formData.section}
              onValueChange={(value) =>
                setFormData({ ...formData, section: value })
              }
            >
              <SelectTrigger id="section">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="job">Job</SelectItem>
                <SelectItem value="compensation">Compensation</SelectItem>
                <SelectItem value="documents">Documents</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orderIndex">Display Order</Label>
            <Input
              id="orderIndex"
              type="number"
              value={formData.orderIndex}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  orderIndex: parseInt(e.target.value, 10),
                })
              }
              placeholder="0"
            />
            <p className="text-sm text-muted-foreground">
              Lower numbers appear first
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isRequired"
              checked={formData.isRequired}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isRequired: checked as boolean })
              }
            />
            <Label htmlFor="isRequired" className="cursor-pointer">
              Required field
            </Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={isLoading}>
              {field ? "Update" : "Create"} Custom Field
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/settings/custom-fields")}
              disabled={isLoading}
            >
              Cancel
            </Button>
            {field && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
                className="ml-auto"
              >
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
