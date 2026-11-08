"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Policy {
  id: number;
  name: string;
  policyType: string;
  country: string | null;
  accrualRate: string | null;
  accrualPeriod: string | null;
  maxCarryover: string | null;
  maxBalance: string | null;
  requiresApproval: boolean | null;
  description: string | null;
}

interface TimeOffPolicyListProps {
  policies: Policy[];
}

export function TimeOffPolicyList({ policies }: TimeOffPolicyListProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!policyToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/settings/time-off-policies/${policyToDelete}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete policy");
      }

      toast.success("Policy deleted successfully");
      router.refresh();
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
      setPolicyToDelete(null);
    }
  };

  const confirmDelete = (policyId: number) => {
    setPolicyToDelete(policyId);
    setDeleteDialogOpen(true);
  };

  if (policies.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No policies configured yet. Create your first policy to get started.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Accrual</TableHead>
            <TableHead>Max Balance</TableHead>
            <TableHead>Approval</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((policy) => (
            <TableRow key={policy.id}>
              <TableCell className="font-medium">{policy.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{policy.policyType}</Badge>
              </TableCell>
              <TableCell>{policy.country || "—"}</TableCell>
              <TableCell>
                {policy.accrualRate && policy.accrualPeriod
                  ? `${policy.accrualRate} / ${policy.accrualPeriod}`
                  : "—"}
              </TableCell>
              <TableCell>
                {policy.maxBalance ? parseFloat(policy.maxBalance).toFixed(1) : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={policy.requiresApproval ? "default" : "secondary"}>
                  {policy.requiresApproval ? "Required" : "Not Required"}
                </Badge>
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/settings/time-off-policies/${policy.id}/edit`)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => confirmDelete(policy.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time-off policy? This action cannot be
              undone. The policy cannot be deleted if any employees have active balances.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
