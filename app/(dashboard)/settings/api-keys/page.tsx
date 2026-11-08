"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, Copy, Eye, EyeOff, AlertTriangle } from "lucide-react";

export default function ApiKeysPage() {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const response = await fetch("/api/settings/api-key");
      if (response.ok) {
        const data = await response.json();
        setHasApiKey(data.hasApiKey);
      }
    } catch (error) {
      console.error("Failed to check API key:", error);
    }
  };

  const generateApiKey = async () => {
    if (hasApiKey) {
      if (!confirm("This will revoke your existing API key. Continue?")) {
        return;
      }
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/settings/api-key", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setNewApiKey(data.apiKey);
        setHasApiKey(true);
        setShowKey(true);
      } else {
        alert("Failed to generate API key");
      }
    } catch (error) {
      console.error("Generation failed:", error);
      alert("Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey);
      alert("API key copied to clipboard");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">API Keys</h1>
        <p className="text-muted-foreground">
          Manage your API access credentials
        </p>
      </div>

      {newApiKey && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Save this API key now.</strong> You won&apos;t be able to see it again.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>API Authentication</CardTitle>
          <CardDescription>
            Use API keys to authenticate requests to the BambooHR-compatible API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {newApiKey && (
            <div className="space-y-2">
              <Label>Your API Key</Label>
              <div className="flex gap-2">
                <Input
                  type={showKey ? "text" : "password"}
                  value={newApiKey}
                  readOnly
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="bg-muted p-4 rounded-md space-y-2">
            <h3 className="font-medium">Usage</h3>
            <p className="text-sm text-muted-foreground">
              Use Basic authentication with your API key as the username:
            </p>
            <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
              {`Authorization: Basic <base64(apiKey:x)>`}
            </pre>
            <p className="text-sm text-muted-foreground">
              Example using curl:
            </p>
            <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
              {`curl -u "your-api-key:x" https://vpeople.vercel.app/api/bamboo/v1/employees/directory`}
            </pre>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {hasApiKey ? "API key is active" : "No API key generated"}
              </span>
            </div>
          </div>

          <Button onClick={generateApiKey} disabled={isGenerating}>
            {isGenerating
              ? "Generating..."
              : hasApiKey
              ? "Regenerate API Key"
              : "Generate API Key"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security Best Practices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>Never share your API key or commit it to version control</li>
            <li>Store API keys securely in environment variables</li>
            <li>Regenerate your key immediately if it&apos;s compromised</li>
            <li>API keys inherit your user permissions - use restricted accounts for integrations</li>
            <li>All API requests are logged and auditable</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
