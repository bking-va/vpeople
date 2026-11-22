"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LocationRow = {
  id: number;
  label: string;
  city: string | null;
  province: string | null;
  country: string;
  postalCode: string | null;
  source: string;
};

export function CustomerLocationsAdmin({ locations }: { locations: LocationRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/settings/customer-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.get("label"),
          city: form.get("city"),
          province: form.get("province"),
          country: form.get("country"),
          postalCode: form.get("postalCode"),
          externalId: form.get("externalId") || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Save failed");
      e.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const importCsv = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/customer-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed");
      setCsv("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/customer-locations?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Delete failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a customer location</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="label">Label</Label>
              <Input id="label" name="label" required placeholder="Acme – Calgary region" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Province / state</Label>
              <Input id="province" name="province" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" name="country" required placeholder="Canada" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal / ZIP</Label>
              <Input id="postalCode" name="postalCode" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="externalId">External id (optional, for a later CRM feed)</Label>
              <Input id="externalId" name="externalId" />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Add location"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSV import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Columns: label, city, province, country, postal_code, external_id. City / province / postal /
            country only — no street addresses. Designed so Vendasta CRM or Lightdash can later upsert by
            external_id.
          </p>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            placeholder={"label,city,province,country,postal_code,external_id\nAcme West,Calgary,Alberta,Canada,T2P 1J9,crm-123"}
          />
          <Button type="button" variant="outline" onClick={importCsv} disabled={saving || !csv.trim()}>
            Import CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved locations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No customer locations yet.</p>
          ) : (
            locations.map((row) => (
              <div key={row.id} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <div className="font-medium">{row.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {[row.city, row.province, row.country, row.postalCode].filter(Boolean).join(", ")}
                    {` · ${row.source}`}
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => remove(row.id)} disabled={saving}>
                  Remove
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
