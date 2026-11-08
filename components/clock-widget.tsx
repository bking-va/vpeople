"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogIn, LogOut, Coffee } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ClockWidget() {
  const [currentClock, setCurrentClock] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchClockStatus();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchClockStatus = async () => {
    try {
      const response = await fetch("/api/time-tracking/clock");
      if (response.ok) {
        const data = await response.json();
        setCurrentClock(data.currentClock);
      }
    } catch (error) {
      console.error("Failed to fetch clock status:", error);
    }
  };

  const handleClock = async (action: "in" | "out") => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/time-tracking/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        await fetchClockStatus();
      } else {
        alert("Clock action failed");
      }
    } catch (error) {
      console.error("Clock action failed:", error);
      alert("Clock action failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBreak = async (breakAction: "start" | "end") => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/time-tracking/clock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: breakAction === "start" ? "start_break" : "end_break",
        }),
      });

      if (response.ok) {
        await fetchClockStatus();
      } else {
        alert("Break action failed");
      }
    } catch (error) {
      console.error("Break action failed:", error);
      alert("Break action failed");
    } finally {
      setIsLoading(false);
    }
  };

  const formatElapsedTime = () => {
    if (!currentClock?.clockIn) return "00:00:00";
    const start = new Date(currentClock.clockIn);
    let diff = currentTime.getTime() - start.getTime();
    
    // Subtract recorded break time
    const breakMs = (currentClock.breakMinutes || 0) * 60000;
    diff -= breakMs;
    
    // Subtract current ongoing break
    if (currentClock.breakStart) {
      const breakStartTime = new Date(currentClock.breakStart);
      const currentBreakMs = currentTime.getTime() - breakStartTime.getTime();
      diff -= currentBreakMs;
    }
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const onBreak = currentClock?.breakStart != null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Time Clock</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {currentClock ? (
          <>
            <div className="flex items-center justify-between">
              <Badge variant={onBreak ? "secondary" : "default"}>
                {onBreak ? "On Break" : "Clocked In"}
              </Badge>
              <span className="text-2xl font-mono font-bold">
                {formatElapsedTime()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Since {new Date(currentClock.clockIn).toLocaleTimeString()}
              {currentClock.breakMinutes > 0 && (
                <> • {currentClock.breakMinutes}m break</>
              )}
            </p>
            <div className="flex gap-2">
              {onBreak ? (
                <Button
                  onClick={() => handleBreak("end")}
                  disabled={isLoading}
                  className="flex-1"
                  variant="outline"
                >
                  <Coffee className="mr-2 h-4 w-4" />
                  End Break
                </Button>
              ) : (
                <Button
                  onClick={() => handleBreak("start")}
                  disabled={isLoading}
                  className="flex-1"
                  variant="outline"
                >
                  <Coffee className="mr-2 h-4 w-4" />
                  Start Break
                </Button>
              )}
              <Button
                onClick={() => handleClock("out")}
                disabled={isLoading || onBreak}
                className="flex-1"
                variant="outline"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Clock Out
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">Not clocked in</p>
            <Button
              onClick={() => handleClock("in")}
              disabled={isLoading}
              className="w-full"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Clock In
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
