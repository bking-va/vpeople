import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, TrendingUp, Users, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function ENPSPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const isAdmin = session.user.role === "admin" || session.user.role === "full_admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Employee Net Promoter Score (eNPS)</h1>
        <p className="text-muted-foreground">
          Measure employee satisfaction and engagement
        </p>
      </div>

      {isAdmin && (
        <>
          <div className="grid gap-6 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">eNPS Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">--</div>
                <p className="text-xs text-muted-foreground">No surveys yet</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0%</div>
                <p className="text-xs text-muted-foreground">0 / 0 responses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Promoters</CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground">Scores 9-10</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Detractors</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground">Scores 0-6</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Survey History</CardTitle>
              <CardDescription>Past eNPS surveys and results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Surveys Sent</h3>
                <p className="text-muted-foreground mb-4">
                  Start measuring employee satisfaction with eNPS surveys
                </p>
                <div className="p-4 border rounded-lg bg-muted max-w-md mx-auto">
                  <h4 className="font-medium mb-2">About eNPS</h4>
                  <p className="text-sm text-muted-foreground">
                    eNPS measures employee loyalty with one simple question:
                    &quot;How likely are you to recommend this company as a place to work?&quot;
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Engagement Surveys</CardTitle>
            <CardDescription>Share your feedback</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Active Surveys</h3>
              <p className="text-muted-foreground">
                You&apos;ll be notified when new engagement surveys are available
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
