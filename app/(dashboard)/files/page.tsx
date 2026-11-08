import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FileCheck, Upload, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function FilesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const isAdmin = session.user.role === "admin" || session.user.role === "full_admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Files & Documents</h1>
          <p className="text-muted-foreground">
            Employee documents and e-signature requests
          </p>
        </div>
        {isAdmin && (
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Across all employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Signatures</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Awaiting signature</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5</div>
            <p className="text-xs text-muted-foreground">Document types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">My Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Personal files</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Document Categories</CardTitle>
            <CardDescription>Organize files by type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                "Contracts & Agreements",
                "Tax Forms",
                "Benefits & Insurance",
                "Performance Reviews",
                "Company Policies",
              ].map((category) => (
                <div
                  key={category}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{category}</span>
                  </div>
                  <Badge variant="secondary">0</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>E-Signature Requests</CardTitle>
            <CardDescription>Documents requiring signature</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Pending Signatures</h3>
              <p className="text-muted-foreground">
                Documents requiring your signature will appear here
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>Latest uploaded files</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Documents</h3>
            <p className="text-muted-foreground">
              Uploaded documents will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
