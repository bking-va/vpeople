"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CalendarFeedsProps {
  employeeId: number;
}

export function CalendarFeeds({ employeeId }: CalendarFeedsProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    fetchToken();
  }, [employeeId]);

  const fetchToken = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/calendar/token?employeeId=${employeeId}`);
      if (response.ok) {
        const data = await response.json();
        setToken(data.token);
      }
    } catch (error) {
      console.error("Failed to fetch calendar token:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateToken = async () => {
    if (!confirm("Are you sure? This will invalidate your existing calendar subscription URLs.")) {
      return;
    }

    setIsRegenerating(true);
    try {
      const response = await fetch("/api/calendar/generate-token", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setToken(data.token);
      } else {
        alert("Failed to regenerate token");
      }
    } catch (error) {
      console.error("Failed to regenerate token:", error);
      alert("Failed to regenerate token");
    } finally {
      setIsRegenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Calendar Feeds</CardTitle>
          <CardDescription>
            Generate a calendar token to subscribe to your time off and holiday calendars
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={regenerateToken} disabled={isRegenerating}>
            Generate Calendar Token
          </Button>
        </CardContent>
      </Card>
    );
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const timeOffUrl = `${baseUrl}/api/calendar/${token}/time-off`;
  const holidaysUrl = `${baseUrl}/api/calendar/${token}/holidays`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar Feeds</CardTitle>
        <CardDescription>
          Subscribe to your personalized time off and holiday calendars
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertDescription>
            <strong>Note:</strong> If this deployment is protected by Vercel Authentication,
            external calendar applications (Google Calendar, Outlook, Apple Calendar) may not be
            able to access these feeds without additional configuration. You may need to configure
            a bypass rule or use an alternative authentication method.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="timeOffUrl">Time Off Calendar URL</Label>
          <div className="flex gap-2">
            <Input id="timeOffUrl" value={timeOffUrl} readOnly />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(timeOffUrl)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Subscribe to this URL in your calendar app to see your approved time off
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="holidaysUrl">Holidays Calendar URL</Label>
          <div className="flex gap-2">
            <Input id="holidaysUrl" value={holidaysUrl} readOnly />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(holidaysUrl)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Subscribe to this URL in your calendar app to see company holidays
          </p>
        </div>

        <div className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={regenerateToken}
            disabled={isRegenerating}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate Token
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Regenerating will invalidate the current URLs
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
