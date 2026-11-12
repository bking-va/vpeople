"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BalanceOption = {
  employeeId: number;
  policyId: number;
  label: string;
};

export function TimeOffAdjustmentForm({ balances }: { balances: BalanceOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [employeeId, policyId] = selected.split(":").map((part) => parseInt(part, 10));
    if (!Number.isFinite(employeeId) || !Number.isFinite(policyId)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/time-off/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, policyId, amount, reason }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to adjust balance");
      }
      setAmount("");
      setReason("");
      router.refresh();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to adjust balance");
    } finally {
      setSaving(false);
    }
  };

  if (balances.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual balance adjustment</CardTitle>
        <CardDescription>
          Writes a durable ledger row (who, when, employee, policy, delta, reason)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adjustmentTarget">Employee and policy</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="adjustmentTarget">
                <SelectValue placeholder="Select a balance" />
              </SelectTrigger>
              <SelectContent>
                {balances.map((item) => (
                  <SelectItem
                    key={`${item.employeeId}-${item.policyId}`}
                    value={`${item.employeeId}:${item.policyId}`}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adjustmentAmount">Delta (days)</Label>
              <Input
                id="adjustmentAmount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1.5 or -1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustmentReason">Reason</Label>
              <Input
                id="adjustmentReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Correction / carry-in"
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving || !selected || !reason.trim()}>
            {saving ? "Saving..." : "Record adjustment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
