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
import { CANADIAN_ROE_CODES } from "@/lib/roe";

interface Reason {
  id: number;
  code: string;
  name: string;
  category: string;
  roeCode: string;
  description: string | null;
  isActive: boolean;
}

export function TerminationReasonList({ reasons }: { reasons: Reason[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("voluntary");
  const [roeCode, setRoeCode] = useState("E");
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/termination-reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, category, roeCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create reason");
      }
      setCode("");
      setName("");
      router.refresh();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this termination reason?")) return;
    const res = await fetch(`/api/settings/termination-reasons/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to delete");
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="grid md:grid-cols-5 gap-3 items-end">
        <div className="space-y-1">
          <Label>Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="voluntary">Voluntary</SelectItem>
              <SelectItem value="involuntary">Involuntary</SelectItem>
              <SelectItem value="retirement">Retirement</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>ROE code</Label>
          <Select value={roeCode} onValueChange={setRoeCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANADIAN_ROE_CODES.map((row) => (
                <SelectItem key={row.code} value={row.code}>
                  {row.code} — {row.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Adding..." : "Add reason"}
        </Button>
      </form>

      <div className="space-y-2">
        {reasons.map((reason) => (
          <div key={reason.id} className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <p className="font-medium">{reason.name}</p>
              <p className="text-sm text-muted-foreground">
                {reason.code} · {reason.category} · ROE {reason.roeCode}
                {!reason.isActive ? " · inactive" : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleDelete(reason.id)}>
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
