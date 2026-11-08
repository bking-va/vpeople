"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileText, CheckCircle, Clock } from "lucide-react";

interface Document {
  id: number;
  title: string;
  category: string;
  status: string;
  signedAt: string | null;
  createdAt: string;
}

export function ProfileDocuments({
  employeeId,
  documents,
  canUpload,
}: {
  employeeId: number;
  documents: Document[];
  canUpload: boolean;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);
    formData.append("category", "other");
    formData.append("employeeId", employeeId.toString());

    setIsUploading(true);
    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        window.location.reload();
      } else {
        alert("Upload failed");
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (docId: number) => {
    // Open download URL directly - server streams the file
    window.location.href = `/api/documents/${docId}/download`;
  };

  const handleSign = async (docId: number) => {
    if (!confirm("Are you sure you want to sign this document?")) return;

    try {
      const response = await fetch(`/api/documents/${docId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        alert("Signing failed");
      }
    } catch (error) {
      console.error("Signing failed:", error);
      alert("Signing failed");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "signed":
        return <Badge variant="default">Signed</Badge>;
      case "pending_signature":
        return <Badge variant="outline">Pending Signature</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Documents</CardTitle>
        {canUpload && (
          <div>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
            <Button
              size="sm"
              onClick={() => document.getElementById("file-upload")?.click()}
              disabled={isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No documents yet
          </p>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {doc.category} • {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(doc.status)}
                  {doc.status === "pending_signature" && (
                    <Button size="sm" onClick={() => handleSign(doc.id)}>
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Sign
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(doc.id)}
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
  );
}
