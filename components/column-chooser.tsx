"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Columns3 } from "lucide-react";

interface Column {
  id: string;
  label: string;
}

interface ColumnChooserProps {
  availableColumns: Column[];
  selectedColumns: string[];
  onColumnChange: (columns: string[]) => void;
}

export function ColumnChooser({
  availableColumns,
  selectedColumns,
  onColumnChange,
}: ColumnChooserProps) {
  const [open, setOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState(selectedColumns);

  const handleToggle = (columnId: string) => {
    setTempSelected((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    );
  };

  const handleApply = () => {
    onColumnChange(tempSelected);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Choose Columns</DialogTitle>
          <DialogDescription>
            Select which columns to display in the employee list
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4 max-h-[400px] overflow-y-auto">
          {availableColumns.map((column) => (
            <div key={column.id} className="flex items-center space-x-2">
              <Checkbox
                id={column.id}
                checked={tempSelected.includes(column.id)}
                onCheckedChange={() => handleToggle(column.id)}
              />
              <label
                htmlFor={column.id}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {column.label}
              </label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
