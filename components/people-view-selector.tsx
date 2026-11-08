"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Plus, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

interface SavedView {
  id: number;
  name: string;
  isDefault: boolean;
}

interface PeopleViewSelectorProps {
  views: SavedView[];
  currentView?: SavedView;
}

export function PeopleViewSelector({ views, currentView }: PeopleViewSelectorProps) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {currentView?.name || "All Employees"}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/people")}>
          All Employees
        </DropdownMenuItem>
        {views.map((view) => (
          <DropdownMenuItem
            key={view.id}
            onClick={() => router.push(`/people?view=${view.id}`)}
          >
            {view.name}
            {view.isDefault && " (Default)"}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/people/views/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Create New View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/people/views")}>
          <Settings className="mr-2 h-4 w-4" />
          Manage Views
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
