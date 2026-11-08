"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface CustomField {
  id: number;
  name: string;
  fieldType: string;
  entityType: string;
  section: string;
  options: string | null;
  isRequired: boolean;
  orderIndex: number;
}

interface CustomFieldValue {
  id: number;
  customFieldId: number;
  entityId: number;
  value: string;
}

interface CustomFieldsDisplayProps {
  section: string;
  entityId: number;
  canEdit: boolean;
}

export function CustomFieldsDisplay({
  section,
  entityId,
  canEdit,
}: CustomFieldsDisplayProps) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchFieldsAndValues();
  }, [section, entityId]);

  const fetchFieldsAndValues = async () => {
    setIsLoading(true);
    try {
      const [fieldsRes, valuesRes] = await Promise.all([
        fetch("/api/custom-fields"),
        fetch(`/api/custom-fields/values?entityId=${entityId}&section=${section}`),
      ]);

      if (fieldsRes.ok) {
        const fieldsData = await fieldsRes.json();
        const sectionFields = fieldsData.fields.filter(
          (f: CustomField) => f.section === section
        );
        setFields(sectionFields);

        if (valuesRes.ok) {
          const valuesData = await valuesRes.json();
          const valuesMap: Record<number, string> = {};
          valuesData.values.forEach((v: CustomFieldValue) => {
            valuesMap[v.customFieldId] = v.value;
          });
          setValues(valuesMap);
        }
      }
    } catch (error) {
      console.error("Failed to fetch custom fields:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (fieldId: number, value: string) => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/custom-fields/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customFieldId: fieldId,
          entityId,
          value,
        }),
      });

      if (response.ok) {
        setValues({ ...values, [fieldId]: value });
      } else {
        alert("Failed to save custom field value");
      }
    } catch (error) {
      console.error("Failed to save custom field value:", error);
      alert("Failed to save custom field value");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading custom fields...</p>;
  }

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 pt-4 border-t">
      <h3 className="font-semibold">Custom Fields</h3>
      {fields.map((field) => {
        const currentValue = values[field.id] || "";
        const options = field.options ? JSON.parse(field.options) : [];

        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`field-${field.id}`}>
              {field.name}
              {field.isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>

            {field.fieldType === "text" && (
              <div className="flex gap-2">
                <Input
                  id={`field-${field.id}`}
                  value={currentValue}
                  onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                  disabled={!canEdit || isSaving}
                />
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => handleSave(field.id, values[field.id] || "")}
                    disabled={isSaving}
                  >
                    Save
                  </Button>
                )}
              </div>
            )}

            {field.fieldType === "textarea" && (
              <div className="space-y-2">
                <Textarea
                  id={`field-${field.id}`}
                  value={currentValue}
                  onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                  disabled={!canEdit || isSaving}
                  rows={3}
                />
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => handleSave(field.id, values[field.id] || "")}
                    disabled={isSaving}
                  >
                    Save
                  </Button>
                )}
              </div>
            )}

            {field.fieldType === "number" && (
              <div className="flex gap-2">
                <Input
                  id={`field-${field.id}`}
                  type="number"
                  value={currentValue}
                  onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                  disabled={!canEdit || isSaving}
                />
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => handleSave(field.id, values[field.id] || "")}
                    disabled={isSaving}
                  >
                    Save
                  </Button>
                )}
              </div>
            )}

            {field.fieldType === "date" && (
              <div className="flex gap-2">
                <Input
                  id={`field-${field.id}`}
                  type="date"
                  value={currentValue}
                  onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                  disabled={!canEdit || isSaving}
                />
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => handleSave(field.id, values[field.id] || "")}
                    disabled={isSaving}
                  >
                    Save
                  </Button>
                )}
              </div>
            )}

            {field.fieldType === "select" && (
              <div className="flex gap-2">
                <Select
                  value={currentValue}
                  onValueChange={(value) => {
                    setValues({ ...values, [field.id]: value });
                    if (canEdit) handleSave(field.id, value);
                  }}
                  disabled={!canEdit || isSaving}
                >
                  <SelectTrigger id={`field-${field.id}`}>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option: string) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {field.fieldType === "checkbox" && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`field-${field.id}`}
                  checked={currentValue === "true"}
                  onCheckedChange={(checked) => {
                    const value = checked ? "true" : "false";
                    setValues({ ...values, [field.id]: value });
                    if (canEdit) handleSave(field.id, value);
                  }}
                  disabled={!canEdit || isSaving}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
