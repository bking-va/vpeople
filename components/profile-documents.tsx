"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileText, CheckCircle, Trash2, Send } from "lucide-react";

interface SignatureRequest {
  id: number;
  status: string;
  signerEmail: string;
  senderEmail: string;
}

interface Document {
  id: number;
  title: string;
  category: string;
  status: string;
  signedAt: string | null;
  createdAt: string;
  body?: string | null;
  fileUrl?: string | null;
  bambooId?: string | null;
  signatureRequest?: SignatureRequest | null;
}

export function ProfileDocuments({
  employeeId,
  documents,
  canUpload,
  canRequestSignature,
}: {
  employeeId: number;
  documents: Document[];
  canUpload: boolean;
  canRequestSignature: boolean;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    documentId: number;
    requestId: number;
    title: string;
    senderEmail: string;
    signerEmail: string;
    signerName: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        const body = await response.json().catch(() => ({}));
        alert(body.error || "Signing failed");
      }
    } catch (error) {
      console.error("Signing failed:", error);
      alert("Signing failed");
    }
  };

  const handlePreview = async (docId: number) => {
    setBusyId(docId);
    setMessage(null);
    try {
      const response = await fetch(`/api/documents/${docId}/signature-requests`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Preview failed");
      }
      setPreview({
        documentId: docId,
        requestId: body.request.id,
        title: body.preview.title,
        senderEmail: body.preview.senderEmail,
        signerEmail: body.preview.signerEmail,
        signerName: body.preview.signerName,
      });
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleSend = async () => {
    if (!preview) return;
    if (
      !confirm(
        `Send “${preview.title}” to ${preview.signerEmail} via vSign as ${preview.senderEmail}? This emails the signer.`
      )
    ) {
      return;
    }
    setBusyId(preview.requestId);
    setMessage(null);
    try {
      const response = await fetch(`/api/signature-requests/${preview.requestId}/send`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Send failed");
      }
      window.location.reload();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Send failed");
      setBusyId(null);
    }
  };

  const handleDelete = async (docId: number) => {
    if (!confirm("Are you sure you want to delete this document? This action cannot be undone.")) return;

    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        window.location.reload();
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Delete failed");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Delete failed");
    }
  };

  const getStatusBadge = (doc: Document) => {
    const signing = doc.signatureRequest?.status;
    if (signing === "sent") return <Badge variant="outline">Sent via vSign</Badge>;
    if (signing === "viewed") return <Badge variant="outline">Viewed</Badge>;
    if (signing === "signed" || doc.status === "signed") return <Badge variant="default">Signed</Badge>;
    if (signing === "declined") return <Badge variant="secondary">Declined</Badge>;
    if (signing === "voided") return <Badge variant="secondary">Voided</Badge>;
    if (signing === "draft") return <Badge variant="outline">Preview ready</Badge>;
    if (doc.status === "pending_signature") {
      return <Badge variant="outline">Pending Signature</Badge>;
    }
    if (doc.status === "draft") return <Badge variant="secondary">Draft</Badge>;
    return <Badge variant="secondary">{doc.status}</Badge>;
  };

  const vsignOutstanding = (doc: Document) =>
    doc.signatureRequest?.status === "sent" || doc.signatureRequest?.status === "viewed";

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
        {message && (
          <p className="text-sm text-destructive mb-3">{message}</p>
        )}
        {documents.some(
          (doc) =>
            doc.signatureRequest?.status === "sent" ||
            doc.signatureRequest?.status === "viewed"
        ) && (
          <div className="mb-4 rounded-lg border p-4 space-y-2">
            <p className="font-medium">Pending signatures</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {documents
                .filter(
                  (doc) =>
                    doc.signatureRequest?.status === "sent" ||
                    doc.signatureRequest?.status === "viewed"
                )
                .map((doc) => (
                  <li key={doc.id}>
                    {doc.title} — {doc.signatureRequest?.status} via vSign
                    {doc.signatureRequest?.signerEmail
                      ? ` (${doc.signatureRequest.signerEmail})`
                      : ""}
                  </li>
                ))}
            </ul>
          </div>
        )}
        {preview && (
          <div className="mb-4 rounded-lg border p-4 space-y-2">
            <p className="font-medium">Preview — nothing has been sent</p>
            <p className="text-sm text-muted-foreground">
              {preview.title} will be emailed to {preview.signerName} ({preview.signerEmail})
              from {preview.senderEmail} through vSign. A signature and date field are placed
              on the last page. The signed PDF, including the certificate of completion, is
              stored on this record when they finish.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSend} disabled={busyId === preview.requestId}>
                <Send className="mr-1 h-4 w-4" />
                {busyId === preview.requestId ? "Sending…" : "Send via vSign"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
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
                    {doc.body && (
                      <pre className="mt-2 max-w-xl whitespace-pre-wrap text-xs text-muted-foreground">
                        {doc.body}
                      </pre>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(doc)}
                  {canRequestSignature &&
                    !doc.bambooId &&
                    doc.status !== "signed" &&
                    !vsignOutstanding(doc) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePreview(doc.id)}
                        disabled={busyId === doc.id}
                      >
                        <Send className="mr-1 h-4 w-4" />
                        {busyId === doc.id ? "Preparing…" : "Send for signature"}
                      </Button>
                    )}
                  {doc.status === "pending_signature" && !doc.bambooId && !vsignOutstanding(doc) && (
                    <Button size="sm" onClick={() => handleSign(doc.id)}>
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Sign
                    </Button>
                  )}
                  {doc.fileUrl?.startsWith("https://") ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(doc.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {canUpload && !doc.bambooId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(doc.id)}
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
