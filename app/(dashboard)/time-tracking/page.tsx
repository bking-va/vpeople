"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClockWidget } from "@/components/clock-widget";
import { Clock, Calendar, CheckCircle, XCircle } from "lucide-react";

export default function TimeTrackingPage() {
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchTimesheets();
    fetchPendingApprovals();
  }, []);

  const fetchTimesheets = async () => {
    try {
      const response = await fetch("/api/time-tracking/timesheets");
      if (response.ok) {
        const data = await response.json();
        setTimesheets(data.timesheets || []);
      }
    } catch (error) {
      console.error("Failed to fetch timesheets:", error);
    }
  };

  const fetchPendingApprovals = async () => {
    try {
      const response = await fetch("/api/time-tracking/timesheets?status=submitted");
      if (response.ok) {
        const data = await response.json();
        setPendingApprovals(data.timesheets || []);
      }
    } catch (error) {
      console.error("Failed to fetch approvals:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/time-tracking/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          totalHours: parseFloat(totalHours),
        }),
      });

      if (response.ok) {
        setShowSubmitForm(false);
        setWeekStart("");
        setWeekEnd("");
        setTotalHours("");
        await fetchTimesheets();
        alert("Timesheet submitted successfully!");
      } else {
        alert("Failed to submit timesheet");
      }
    } catch (error) {
      console.error("Submission failed:", error);
      alert("Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproval = async (timesheetId: number, action: "approve" | "reject") => {
    try {
      const response = await fetch(`/api/time-tracking/timesheets/${timesheetId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        await fetchPendingApprovals();
        alert(`Timesheet ${action}d successfully`);
      } else {
        alert(`Failed to ${action} timesheet`);
      }
    } catch (error) {
      console.error("Approval failed:", error);
      alert("Approval failed");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="default">Approved</Badge>;
      case "submitted":
        return <Badge variant="outline">Pending</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Time & Attendance</h1>
        <p className="text-muted-foreground">
          Track your hours and manage timesheets
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ClockWidget />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Quick Stats</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">This Week</span>
                <span className="text-sm font-bold">40.0 hours</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">This Month</span>
                <span className="text-sm font-bold">160.0 hours</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>My Timesheets</CardTitle>
            <CardDescription>Submit and track your timesheets</CardDescription>
          </div>
          <Button onClick={() => setShowSubmitForm(!showSubmitForm)}>
            Submit Timesheet
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showSubmitForm && (
            <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weekStart">Week Start</Label>
                  <Input
                    id="weekStart"
                    type="date"
                    value={weekStart}
                    onChange={(e) => setWeekStart(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weekEnd">Week End</Label>
                  <Input
                    id="weekEnd"
                    type="date"
                    value={weekEnd}
                    onChange={(e) => setWeekEnd(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalHours">Total Hours</Label>
                <Input
                  id="totalHours"
                  type="number"
                  step="0.5"
                  value={totalHours}
                  onChange={(e) => setTotalHours(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSubmitForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {timesheets.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No timesheets yet
            </p>
          ) : (
            <div className="space-y-3">
              {timesheets.map((sheet) => (
                <div
                  key={sheet.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      Week of {new Date(sheet.weekStartDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {sheet.totalHours} hours
                    </p>
                  </div>
                  {getStatusBadge(sheet.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pendingApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
            <CardDescription>Review and approve team timesheets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingApprovals.map((sheet) => (
                <div
                  key={sheet.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      Week of {new Date(sheet.weekStartDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {sheet.totalHours} hours • Submitted {new Date(sheet.submittedAt || sheet.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApproval(sheet.id, "approve")}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApproval(sheet.id, "reject")}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
