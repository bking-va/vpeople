import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FileCheck, Upload, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { documents, employees } from "@/lib/db/schema";
import { eq, and, count, desc, sql } from "drizzle-orm";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function FilesPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (!employee) {
    redirect("/auth/signin");
  }

  const isAdmin = session.user.role === "admin" || session.user.role === "full_admin";

  // Get document counts
  const [totalDocsResult] = await db
    .select({ count: count() })
    .from(documents);

  const [pendingSignaturesResult] = await db
    .select({ count: count() })
    .from(documents)
    .where(eq(documents.status, "pending_signature"));

  const [myDocsResult] = await db
    .select({ count: count() })
    .from(documents)
    .where(eq(documents.employeeId, employee.id));

  const recentDocs = await db
    .select({
      id: documents.id,
      title: documents.title,
      category: documents.category,
      status: documents.status,
      createdAt: documents.createdAt,
      employeeId: documents.employeeId,
    })
    .from(documents)
    .orderBy(desc(documents.createdAt))
    .limit(10);

  // Get pending signature documents for current user or managed employees
  const pendingSignatureDocs = await db
    .select({
      id: documents.id,
      title: documents.title,
      category: documents.category,
      createdAt: documents.createdAt,
      employeeId: documents.employeeId,
    })
    .from(documents)
    .where(
      isAdmin 
        ? eq(documents.status, "pending_signature")
        : and(
            eq(documents.status, "pending_signature"),
            eq(documents.employeeId, employee.id)
          )
    )
    .orderBy(desc(documents.createdAt))
    .limit(10);

  // Get category counts
  const categoryCounts = await db
    .select({
      category: documents.category,
      count: sql<number>`count(*)::int`,
    })
    .from(documents)
    .groupBy(documents.category);

  const categoryMap = new Map(categoryCounts.map(c => [c.category, c.count]));

  const totalDocs = totalDocsResult.count;
  const pendingSignatures = pendingSignaturesResult.count;
  const myDocs = myDocsResult.count;

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
            <div className="text-2xl font-bold">{totalDocs}</div>
            <p className="text-xs text-muted-foreground">Across all employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Signatures</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingSignatures}</div>
            <p className="text-xs text-muted-foreground">Awaiting signature</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">6</div>
            <p className="text-xs text-muted-foreground">Document types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">My Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myDocs}</div>
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
              {([
                { key: "contract" as const, label: "Contracts & Agreements" },
                { key: "tax_form" as const, label: "Tax Forms" },
                { key: "benefits" as const, label: "Benefits & Insurance" },
                { key: "performance" as const, label: "Performance Reviews" },
                { key: "policy" as const, label: "Company Policies" },
                { key: "other" as const, label: "Other Documents" },
              ] as const).map((category) => (
                <div
                  key={category.key}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{category.label}</span>
                  </div>
                  <Badge variant="secondary">
                    {categoryMap.get(category.key) || 0}
                  </Badge>
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
            {pendingSignatureDocs.length === 0 ? (
              <div className="text-center py-12">
                <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Pending Signatures</h3>
                <p className="text-muted-foreground">
                  Documents requiring your signature will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingSignatureDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <FileCheck className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <Link
                          href={`/people/${doc.employeeId}#documents`}
                          className="font-medium hover:underline"
                        >
                          {doc.title}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {doc.category} • {formatDate(doc.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="default">
                      Sign
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>Latest uploaded files</CardDescription>
        </CardHeader>
        <CardContent>
          {recentDocs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Documents</h3>
              <p className="text-muted-foreground">
                Uploaded documents will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Link
                        href={`/people/${doc.employeeId}#documents`}
                        className="font-medium hover:underline"
                      >
                        {doc.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {doc.category} • {formatDate(doc.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{doc.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
