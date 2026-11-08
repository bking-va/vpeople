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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Plus, Edit2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface SavedView {
  id: number;
  name: string;
  isDefault: boolean;
}

interface PeopleViewSelectorProps {
  views: SavedView[];
  currentView?: SavedView;
  onViewChange?: () => void;
}

export function PeopleViewSelector({ views, currentView, onViewChange }: PeopleViewSelectorProps) {
  const router = useRouter();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [renameViewId, setRenameViewId] = useState<number | null>(null);
  const [renameViewName, setRenameViewName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateView = async () => {
    if (!newViewName.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/people/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newViewName,
          columns: ["employeeNumber", "name", "email", "jobTitle", "department", "location"],
          isDefault: false,
        }),
      });

      if (response.ok) {
        setShowCreateDialog(false);
        setNewViewName("");
        onViewChange?.();
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to create view:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenameView = async () => {
    if (!renameViewId || !renameViewName.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/people/views/${renameViewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameViewName }),
      });

      if (response.ok) {
        setShowRenameDialog(false);
        setRenameViewId(null);
        setRenameViewName("");
        onViewChange?.();
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to rename view:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteView = async (viewId: number) => {
    if (!confirm("Are you sure you want to delete this view?")) return;

    try {
      const response = await fetch(`/api/people/views/${viewId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        onViewChange?.();
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to delete view:", error);
    }
  };

  return (
    <>
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
          <DropdownMenuItem onClick={() => router.push("/people/directory")}>
            All Employees
          </DropdownMenuItem>
          {views.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onClick={() => router.push(`/people/directory?view=${view.id}`)}
            >
              {view.name}
              {view.isDefault && " (Default)"}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create New View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowManageDialog(true)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Manage Views
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create View Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New View</DialogTitle>
            <DialogDescription>
              Create a custom view with your preferred columns and filters
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="viewName">View Name</Label>
              <Input
                id="viewName"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="e.g., Sales Team"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateView} disabled={isSubmitting || !newViewName.trim()}>
              {isSubmitting ? "Creating..." : "Create View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Views Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Views</DialogTitle>
            <DialogDescription>Rename or delete your saved views</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {views.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No saved views yet
              </p>
            ) : (
              views.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <span className="font-medium">{view.name}</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRenameViewId(view.id);
                        setRenameViewName(view.name);
                        setShowManageDialog(false);
                        setShowRenameDialog(true);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteView(view.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename View Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename View</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="renameViewName">View Name</Label>
            <Input
              id="renameViewName"
              value={renameViewName}
              onChange={(e) => setRenameViewName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameView} disabled={isSubmitting || !renameViewName.trim()}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
