"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { PeopleViewSelector } from "@/components/people-view-selector";
import { ColumnChooserDialog } from "@/components/column-chooser-dialog";
import { useRouter } from "next/navigation";

interface SavedView {
  id: number;
  name: string;
  isDefault: boolean;
}

interface Employee {
  id: number;
  employeeNumber: string | null;
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null | undefined;
  location: string | null | undefined;
  hireDate: string | null;
  workPhone: string | null;
}

interface PeopleDirectoryTableProps {
  employees: Employee[];
  views: SavedView[];
  initialColumns?: string[];
}

const COLUMN_CONFIG: Record<string, { label: string; render: (emp: Employee) => any }> = {
  employeeNumber: { label: "Employee #", render: (e) => e.employeeNumber || "-" },
  name: { label: "Name", render: (e) => e.name },
  email: { label: "Email", render: (e) => e.email },
  jobTitle: { label: "Job Title", render: (e) => e.jobTitle || "-" },
  department: { label: "Department", render: (e) => e.department || "-" },
  location: { label: "Location", render: (e) => e.location || "-" },
  hireDate: { label: "Hire Date", render: (e) => e.hireDate || "-" },
  workPhone: { label: "Work Phone", render: (e) => e.workPhone || "-" },
};

const AVAILABLE_COLUMNS = Object.keys(COLUMN_CONFIG).map((id) => ({
  id,
  label: COLUMN_CONFIG[id].label,
}));

const DEFAULT_COLUMNS = ["employeeNumber", "name", "email", "jobTitle", "department", "location"];

export function PeopleDirectoryTable({
  employees,
  views,
  initialColumns,
}: PeopleDirectoryTableProps) {
  const router = useRouter();
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    initialColumns || DEFAULT_COLUMNS
  );

  useEffect(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem("peopleDirectoryColumns");
    if (saved) {
      try {
        setSelectedColumns(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved columns:", e);
      }
    }
  }, []);

  const handleColumnsChange = (columns: string[]) => {
    setSelectedColumns(columns);
    localStorage.setItem("peopleDirectoryColumns", JSON.stringify(columns));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">People Directory</h1>
          <p className="text-muted-foreground">
            {employees.length} active employees
          </p>
        </div>
        <div className="flex gap-2">
          <PeopleViewSelector views={views} />
          <ColumnChooserDialog
            availableColumns={AVAILABLE_COLUMNS}
            selectedColumns={selectedColumns}
            onColumnsChange={handleColumnsChange}
          />
          <Link href="/people">
            <Button variant="outline">
              <LayoutGrid className="mr-2 h-4 w-4" />
              Grid View
            </Button>
          </Link>
          <Link href="/api/reports/export?type=employees">
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              {selectedColumns.map((col) => (
                <th key={col} className="px-4 py-3 text-left text-sm font-medium">
                  {COLUMN_CONFIG[col]?.label || col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-muted/50">
                {selectedColumns.map((col) => (
                  <td key={col} className="px-4 py-3 text-sm">
                    {col === "name" ? (
                      <Link
                        href={`/people/${emp.id}`}
                        className="font-medium hover:underline"
                      >
                        {COLUMN_CONFIG[col]?.render(emp)}
                      </Link>
                    ) : (
                      COLUMN_CONFIG[col]?.render(emp) || "-"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
