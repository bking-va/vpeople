import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Users, FileText, TrendingUp } from "lucide-react";

export default async function HiringPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const isAdmin = session.user.role === "full_admin" || session.user.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Hiring & Recruiting</h1>
          <p className="text-muted-foreground">Manage job openings and candidates</p>
        </div>
        {isAdmin && (
          <Button>
            <Briefcase className="h-4 w-4 mr-2" />
            New Job Opening
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">No active openings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Candidates</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">In pipeline</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Offers Extended</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Time to Hire</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Average days</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Openings</CardTitle>
          <CardDescription>
            Create and manage open positions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Open Positions</h3>
            <p className="text-muted-foreground mb-4">
              Create your first job opening to start receiving applications
            </p>
            {isAdmin && (
              <Button>Create Job Opening</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Application Pipeline</CardTitle>
            <CardDescription>
              Candidate status breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2">
                <span>New Applications</span>
                <Badge variant="outline">0</Badge>
              </div>
              <div className="flex justify-between items-center p-2">
                <span>Phone Screen</span>
                <Badge variant="outline">0</Badge>
              </div>
              <div className="flex justify-between items-center p-2">
                <span>Interview</span>
                <Badge variant="outline">0</Badge>
              </div>
              <div className="flex justify-between items-center p-2">
                <span>Offer</span>
                <Badge variant="outline">0</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Candidate Sources</CardTitle>
            <CardDescription>
              Where candidates are coming from
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2">
                <span>LinkedIn</span>
                <Badge variant="outline">0</Badge>
              </div>
              <div className="flex justify-between items-center p-2">
                <span>Indeed</span>
                <Badge variant="outline">0</Badge>
              </div>
              <div className="flex justify-between items-center p-2">
                <span>Referral</span>
                <Badge variant="outline">0</Badge>
              </div>
              <div className="flex justify-between items-center p-2">
                <span>Direct</span>
                <Badge variant="outline">0</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
