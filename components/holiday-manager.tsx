"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type Holiday = {
  id: number;
  name: string;
  date: string;
  country: string;
  isRecurring: boolean | null;
};

const COUNTRY_NAMES: Record<string, string> = {
  CA: "Canada",
  US: "United States",
  IN: "India",
};

export function HolidayManager({
  holidays,
  canManage,
}: {
  holidays: Holiday[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [country, setCountry] = useState("CA");
  const [isRecurring, setIsRecurring] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const byCountry = holidays.reduce((acc, holiday) => {
    if (!acc[holiday.country]) acc[holiday.country] = [];
    acc[holiday.country].push(holiday);
    return acc;
  }, {} as Record<string, Holiday[]>);

  const resetForm = () => {
    setName("");
    setDate("");
    setCountry("CA");
    setIsRecurring(true);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!name.trim() || !date) return;
    setSaving(true);
    try {
      const url = editingId ? `/api/holidays/${editingId}` : "/api/holidays";
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, date, country, isRecurring }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save holiday");
      }
      resetForm();
      router.refresh();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to save holiday");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this company holiday?")) return;
    try {
      const response = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete holiday");
      }
      router.refresh();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete holiday");
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit holiday" : "Add company holiday"}</CardTitle>
            <CardDescription>
              Holidays are company-wide and excluded from time-off request days
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="holidayName">Name</Label>
                <Input
                  id="holidayName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holidayDate">Date</Label>
                <Input
                  id="holidayDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holidayCountry">Country</Label>
                <Input
                  id="holidayCountry"
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  placeholder="CA, US, IN"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="holidayRecurring"
                checked={isRecurring}
                onCheckedChange={(checked) => setIsRecurring(checked === true)}
              />
              <Label htmlFor="holidayRecurring">Recurring annually</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || !name.trim() || !date}>
                {saving ? "Saving..." : editingId ? "Save" : "Add holiday"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {Object.entries(byCountry).map(([countryCode, countryHolidays]) => (
          <Card key={countryCode}>
            <CardHeader>
              <CardTitle>{COUNTRY_NAMES[countryCode] || countryCode}</CardTitle>
              <CardDescription>
                {countryHolidays.length} company holidays
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {countryHolidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{holiday.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {String(holiday.date).slice(0, 10)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {holiday.isRecurring && (
                        <Badge variant="secondary" className="text-xs">
                          Recurring
                        </Badge>
                      )}
                      {canManage && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingId(holiday.id);
                              setName(holiday.name);
                              setDate(String(holiday.date).slice(0, 10));
                              setCountry(holiday.country);
                              setIsRecurring(holiday.isRecurring !== false);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(holiday.id)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
