"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface TimeOffPolicyFormProps {
  policy?: {
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
  };
}

export function TimeOffPolicyForm({ policy }: TimeOffPolicyFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: policy?.name || "",
    policyType: policy?.policyType || "vacation",
    country: policy?.country || "",
    accrualRate: policy?.accrualRate || "",
    accrualPeriod: policy?.accrualPeriod || "monthly",
    maxCarryover: policy?.maxCarryover || "",
    maxBalance: policy?.maxBalance || "",
    requiresApproval: policy?.requiresApproval !== false,
    description: policy?.description || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = policy
        ? `/api/settings/time-off-policies/${policy.id}`
        : `/api/settings/time-off-policies`;
      
      const method = policy ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          accrualRate: formData.accrualRate || null,
          maxCarryover: formData.maxCarryover || null,
          maxBalance: formData.maxBalance || null,
          country: formData.country || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save policy");
      }

      toast.success(policy ? "Policy updated successfully" : "Policy created successfully");
      router.push("/settings/time-off-policies");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{policy ? "Edit Policy" : "Create Policy"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Policy Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g. Vacation - Canada"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="policyType">Policy Type *</Label>
              <Select
                value={formData.policyType}
                onValueChange={(value) => setFormData({ ...formData, policyType: value })}
              >
                <SelectTrigger id="policyType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="personal">Personal Days</SelectItem>
                  <SelectItem value="parental">Parental Leave</SelectItem>
                  <SelectItem value="bereavement">Bereavement</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g. Canada, US, India"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accrualRate">Accrual Rate (days)</Label>
              <Input
                id="accrualRate"
                type="number"
                step="0.01"
                value={formData.accrualRate}
                onChange={(e) => setFormData({ ...formData, accrualRate: e.target.value })}
                placeholder="e.g. 1.25"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accrualPeriod">Accrual Period</Label>
              <Select
                value={formData.accrualPeriod}
                onValueChange={(value) => setFormData({ ...formData, accrualPeriod: value })}
              >
                <SelectTrigger id="accrualPeriod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="none">None (Fixed Balance)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxBalance">Max Balance (days)</Label>
              <Input
                id="maxBalance"
                type="number"
                step="0.1"
                value={formData.maxBalance}
                onChange={(e) => setFormData({ ...formData, maxBalance: e.target.value })}
                placeholder="e.g. 30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxCarryover">Max Carryover (days)</Label>
            <Input
              id="maxCarryover"
              type="number"
              step="0.1"
              value={formData.maxCarryover}
              onChange={(e) => setFormData({ ...formData, maxCarryover: e.target.value })}
              placeholder="e.g. 5"
            />
            <p className="text-sm text-muted-foreground">
              Maximum days that can roll over to the next year
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Policy details and eligibility criteria"
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="requiresApproval"
              checked={formData.requiresApproval}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, requiresApproval: checked as boolean })
              }
            />
            <Label htmlFor="requiresApproval" className="cursor-pointer">
              Requires manager approval
            </Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : policy ? "Update Policy" : "Create Policy"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
