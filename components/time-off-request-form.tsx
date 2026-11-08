"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Balance {
  id: number;
  balance: string | null;
  policyId: number | null;
  policyName: string | null;
  policyType: string | null;
}

interface TimeOffRequestFormProps {
  employeeId: number;
  balances: Balance[];
}

export function TimeOffRequestForm({ employeeId, balances }: TimeOffRequestFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const selectedBalance = balances.find(
    (b) => b.policyId?.toString() === selectedPolicyId
  );

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const requestedDays = calculateDays();
  const availableBalance = selectedBalance ? parseFloat(selectedBalance.balance || "0") : 0;
  const balanceAfter = availableBalance - requestedDays;
  const hasInsufficient = balanceAfter < 0;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedPolicyId || !startDate || !endDate) {
      setError("Please fill in all required fields");
      return;
    }

    if (hasInsufficient) {
      setError("Insufficient balance for this request");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch("/api/time-off/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: parseInt(selectedPolicyId),
          startDate,
          endDate,
          reason: formData.get("reason"),
          notes: formData.get("notes"),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit request");
      }

      router.push("/time-off");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Time Off Request Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="policyId">Time Off Type *</Label>
            <Select
              name="policyId"
              value={selectedPolicyId}
              onValueChange={setSelectedPolicyId}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select time off type" />
              </SelectTrigger>
              <SelectContent>
                {balances.map((balance) => (
                  <SelectItem
                    key={balance.policyId}
                    value={balance.policyId!.toString()}
                  >
                    {balance.policyName} - {balance.balance || "0"} days available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                required
              />
            </div>
          </div>

          {selectedPolicyId && startDate && endDate && (
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Days Requested:</span>
                <span className="font-medium">{requestedDays}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Available Balance:</span>
                <span className="font-medium">{availableBalance}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Balance After Request:</span>
                <span className={hasInsufficient ? "text-red-600" : "text-green-600"}>
                  {balanceAfter}
                  {hasInsufficient && (
                    <Badge variant="destructive" className="ml-2">
                      Insufficient
                    </Badge>
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select name="reason">
              <SelectTrigger>
                <SelectValue placeholder="Select reason (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">Vacation</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="sick">Sick Leave</SelectItem>
                <SelectItem value="family">Family</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Add any additional details about your time-off request..."
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={loading || hasInsufficient}>
              {loading ? "Submitting..." : "Submit Request"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
