"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, Download, Trash2 } from "lucide-react";
import Link from "next/link";

export default function SavedReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchReports();
    fetchSchedules();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await fetch("/api/reports/saved");
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await fetch("/api/reports/scheduled");
      if (response.ok) {
        const data = await response.json();
        setSchedules(data.schedules || []);
      }
    } catch (error) {
      console.error("Failed to fetch schedules:", error);
    }
  };

  const handleExport = (report: any) => {
    const fields = JSON.parse(report.fields || "[]");
    const params = new URLSearchParams({
      type: "custom",
      fields: fields.join(","),
      groupBy: report.groupBy || "none",
    });
    window.location.href = `/api/reports/export?${params}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Saved Reports</h1>
        <p className="text-muted-foreground">
          Access your saved reports and scheduled deliveries
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My Saved Reports</CardTitle>
            <CardDescription>Reports you&apos;ve saved for reuse</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : reports.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground mb-4">
                  No saved reports yet
                </p>
                <Link href="/reports/custom">
                  <Button size="sm">Create Report</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{report.name}</p>
                      {report.description && (
                        <p className="text-sm text-muted-foreground">
                          {report.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {new Date(report.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExport(report)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduled Reports</CardTitle>
            <CardDescription>
              Automatic report deliveries (stored schedules only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {schedules.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">
                  No scheduled reports
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Note: Schedules are stored but delivery requires external configuration
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map((item) => (
                  <div
                    key={item.schedule.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{item.report?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.schedule.scheduleType} at {item.schedule.scheduleTime}
                      </p>
                      <Badge
                        variant={item.schedule.isActive ? "default" : "secondary"}
                        className="mt-1"
                      >
                        {item.schedule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
