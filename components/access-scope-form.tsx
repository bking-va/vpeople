"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function AccessScopeForm({
  employeeId,
  locations,
  locationIds,
  countries,
}: {
  employeeId: number;
  locations: { id: number; name: string; country: string }[];
  locationIds: number[];
  countries: string[];
}) {
  const [selectedLocations, setSelectedLocations] = useState<number[]>(locationIds);
  const [countryText, setCountryText] = useState(countries.join(", "));
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleLocation = (id: number) => {
    setSelectedLocations((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/access-scopes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          locationIds: selectedLocations,
          countries: countryText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Save failed");
      setMessage(`Saved ${body.scopes?.length ?? 0} scope(s)`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Locations</Label>
        <div className="mt-2 space-y-1">
          {locations.map((location) => (
            <label key={location.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedLocations.includes(location.id)}
                onChange={() => toggleLocation(location.id)}
              />
              {location.name} ({location.country})
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`countries-${employeeId}`}>Countries (comma-separated)</Label>
        <input
          id={`countries-${employeeId}`}
          className="w-full rounded border px-3 py-2 text-sm"
          value={countryText}
          onChange={(e) => setCountryText(e.target.value)}
        />
      </div>
      <Button type="button" onClick={handleSave} disabled={loading}>
        {loading ? "Saving…" : "Save allowlist"}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
