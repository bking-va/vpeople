"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Columns3 } from "lucide-react";

interface Column {
  id: string;
  label: string;
}

interface ColumnChooserDialogProps {
  availableColumns: Column[];
  selectedColumns: string[];
  onColumnsChange: (columns: string[]) => void;
}

export function ColumnChooserDialog({
  availableColumns,
  selectedColumns,
  onColumnsChange,
}: ColumnChooserDialogProps) {
  const [open, setOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState<string[]>(selectedColumns);

  const handleToggle = (columnId: string) => {
    setTempSelected((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    );
  };

  const handleSave = () => {
    onColumnsChange(tempSelected);
    setOpen(false);
  };

  const handleCancel = () => {
    setTempSelected(selectedColumns);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Columns3 className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose Columns</DialogTitle>
          <DialogDescription>
            Select which columns to display in the table
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {availableColumns.map((column) => (
            <div key={column.id} className="flex items-center space-x-2">
              <Checkbox
                id={column.id}
                checked={tempSelected.includes(column.id)}
                onCheckedChange={() => handleToggle(column.id)}
              />
              <Label
                htmlFor={column.id}
                className="text-sm font-normal cursor-pointer"
              >
                {column.label}
              </Label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
