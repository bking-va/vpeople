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
import { updateEmployeeCompensation } from "@/app/actions/employee";

interface CompensationEditFormProps {
  employeeId: number;
  canEdit: boolean;
}

export function CompensationEditForm({ employeeId, canEdit }: CompensationEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    payRate: "",
    payType: "salary",
    paySchedule: "monthly",
    currency: "CAD",
    effectiveDate: new Date().toISOString().split("T")[0],
    changeReason: "",
  });

  if (!canEdit) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await updateEmployeeCompensation(employeeId, formData);

      if (result.success) {
        if (result.requiresApproval) {
          alert(
            `Compensation change submitted for approval. Request ID: ${result.approvalRequestId}\n\nThe change will be applied after all approvals are complete.`
          );
        } else {
          alert("Compensation updated successfully!");
        }
        router.refresh();
        // Reset form
        setFormData({
          payRate: "",
          payType: "salary",
          paySchedule: "monthly",
          currency: "CAD",
          effectiveDate: new Date().toISOString().split("T")[0],
          changeReason: "",
        });
      } else {
        alert(result.error || "Failed to update compensation");
      }
    } catch (error) {
      console.error("Failed to update compensation:", error);
      alert("Failed to update compensation");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Compensation Change</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="payRate">Pay Rate *</Label>
              <Input
                id="payRate"
                type="text"
                value={formData.payRate}
                onChange={(e) =>
                  setFormData({ ...formData, payRate: e.target.value })
                }
                required
                placeholder="e.g., 85000 or 45.50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payType">Pay Type *</Label>
              <Select
                value={formData.payType}
                onValueChange={(value) =>
                  setFormData({ ...formData, payType: value })
                }
              >
                <SelectTrigger id="payType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary">Salary</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paySchedule">Pay Schedule *</Label>
              <Select
                value={formData.paySchedule}
                onValueChange={(value) =>
                  setFormData({ ...formData, paySchedule: value })
                }
              >
                <SelectTrigger id="paySchedule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="semimonthly">Semi-monthly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency *</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) =>
                  setFormData({ ...formData, currency: value })
                }
              >
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="INR">INR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="effectiveDate">Effective Date *</Label>
              <Input
                id="effectiveDate"
                type="date"
                value={formData.effectiveDate}
                onChange={(e) =>
                  setFormData({ ...formData, effectiveDate: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="changeReason">Change Reason</Label>
              <Textarea
                id="changeReason"
                value={formData.changeReason}
                onChange={(e) =>
                  setFormData({ ...formData, changeReason: e.target.value })
                }
                placeholder="e.g., Annual merit increase, Promotion"
                rows={2}
              />
            </div>
          </div>

          <Button type="submit" disabled={isLoading}>
            Add Compensation Record
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
