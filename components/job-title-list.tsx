"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface JobTitle {
  id: number;
  title: string;
  description: string | null;
  department: string | null;
}

export function JobTitleList({ titles }: { titles: JobTitle[] }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this job title? Employees already using it as free text are not changed.")) {
      return;
    }
    setIsDeleting(id);
    try {
      const response = await fetch(`/api/settings/job-titles/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete job title");
      }
      router.refresh();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsDeleting(null);
    }
  };

  if (titles.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No job titles configured yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {titles.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between border rounded-lg p-3"
        >
          <div>
            <p className="font-medium">{item.title}</p>
            <p className="text-sm text-muted-foreground">
              {item.department || "No department"}
              {item.description ? ` · ${item.description}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/settings/job-titles/${item.id}/edit`)}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDelete(item.id)}
              disabled={isDeleting === item.id}
            >
              {isDeleting === item.id ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
