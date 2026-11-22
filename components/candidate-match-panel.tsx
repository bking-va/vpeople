"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MATCHING_ADVISORY, type LocationRequirement } from "@/lib/matching/types";

type MatchRow = {
  key: string;
  firstName: string;
  lastName: string;
  currentTitle: string | null;
  kinds: Array<"employee" | "applicant">;
  score: number;
  reasons: string[];
  distanceLabel: string | null;
  locationLabel: string | null;
  profilePath: string;
  employmentStatus: string | null;
  applicantStage: string | null;
};

export function CandidateMatchPanel({
  mode,
  jobOpeningId,
  defaultRoleQuery = "",
  defaultRequirement = "none",
  defaultMaxDistanceKm = 50,
  defaultWeight = 0,
  canSaveJobSettings = false,
}: {
  mode: "job" | "ad-hoc";
  jobOpeningId?: number;
  defaultRoleQuery?: string;
  defaultRequirement?: LocationRequirement;
  defaultMaxDistanceKm?: number;
  defaultWeight?: number;
  canSaveJobSettings?: boolean;
}) {
  const [roleQuery, setRoleQuery] = useState(defaultRoleQuery);
  const [locationRequirement, setLocationRequirement] = useState<LocationRequirement>(defaultRequirement);
  const [maxDistanceKm, setMaxDistanceKm] = useState(String(defaultMaxDistanceKm));
  const [locationWeight, setLocationWeight] = useState(String(defaultWeight));
  const [saveFiltersToJob, setSaveFiltersToJob] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisory, setAdvisory] = useState(MATCHING_ADVISORY);
  const [results, setResults] = useState<MatchRow[]>([]);
  const [usage, setUsage] = useState<{ promptTokens: number; completionTokens: number } | null>(null);

  const runSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/hiring/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobOpeningId: jobOpeningId ?? null,
          roleQuery,
          locationRequirement,
          maxDistanceKm: Number(maxDistanceKm),
          locationWeight: Number(locationWeight),
          saveFiltersToJob: canSaveJobSettings && saveFiltersToJob,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Matching failed");
      setAdvisory(data.advisory || MATCHING_ADVISORY);
      setResults(data.results || []);
      setUsage(data.usage || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Matching failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle>Human review required</AlertTitle>
        <AlertDescription>{advisory}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "job" ? "Find candidates" : "Search by role description"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "ad-hoc" && (
            <div className="space-y-2">
              <Label htmlFor="roleQuery">Role description</Label>
              <Textarea
                id="roleQuery"
                value={roleQuery}
                onChange={(e) => setRoleQuery(e.target.value)}
                rows={8}
                placeholder="Paste the role, required skills, and experience. Do not include protected attributes."
              />
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Location requirement</Label>
              <Select
                value={locationRequirement}
                onValueChange={(value) => setLocationRequirement(value as LocationRequirement)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="near_office">Near office</SelectItem>
                  <SelectItem value="near_customers">Near customers</SelectItem>
                  <SelectItem value="near_office_or_customers">Near office or customers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxDistanceKm">Max distance (km)</Label>
              <Input
                id="maxDistanceKm"
                type="number"
                min={1}
                max={20000}
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationWeight">Proximity weight (0–100)</Label>
              <Input
                id="locationWeight"
                type="number"
                min={0}
                max={100}
                value={locationWeight}
                onChange={(e) => setLocationWeight(e.target.value)}
              />
            </div>
          </div>

          {canSaveJobSettings && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveFiltersToJob}
                onChange={(e) => setSaveFiltersToJob(e.target.checked)}
              />
              Save these proximity settings on the job opening
            </label>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">{error}</div>
          )}

          <Button onClick={runSearch} disabled={loading}>
            {loading ? "Searching…" : "Find candidates"}
          </Button>
          {usage && (
            <p className="text-xs text-muted-foreground">
              Tokens this search: {usage.promptTokens} in / {usage.completionTokens} out
            </p>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ranked matches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.map((row) => (
              <div key={row.key} className="border rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={row.profilePath} className="font-medium hover:underline">
                      {row.firstName} {row.lastName}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {row.currentTitle || "Title not on file"}
                      {row.locationLabel ? ` · ${row.locationLabel}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.kinds.map((kind) => (
                      <Badge key={kind} variant={kind === "employee" ? "default" : "secondary"}>
                        {kind === "employee" ? "Employee" : "Applicant"}
                      </Badge>
                    ))}
                    <Badge variant="outline">Score {row.score}</Badge>
                  </div>
                </div>
                {row.distanceLabel && (
                  <p className="text-sm text-muted-foreground">{row.distanceLabel}</p>
                )}
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {row.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
