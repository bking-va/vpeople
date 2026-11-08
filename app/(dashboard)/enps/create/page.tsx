"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CreateEnpsSurveyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [question, setQuestion] = useState(
    "On a scale of 0-10, how likely are you to recommend our company as a great place to work?"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !question) {
      alert("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/enps/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          question,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert("Survey created successfully!");
        router.push("/enps");
      } else {
        alert("Failed to create survey");
      }
    } catch (error) {
      console.error("Survey creation failed:", error);
      alert("Survey creation failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/enps">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Create eNPS Survey</h1>
          <p className="text-muted-foreground">
            Launch a new Employee Net Promoter Score survey
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Survey Details</CardTitle>
          <CardDescription>
            Configure your eNPS survey question and settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Survey Name</Label>
              <Input
                id="name"
                placeholder="Q1 2027 Employee Net Promoter Score"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="question">Question</Label>
              <Textarea
                id="question"
                placeholder="On a scale of 0-10..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                required
              />
              <p className="text-sm text-muted-foreground">
                This question will be shown to all employees. The standard eNPS
                question asks for a 0-10 rating.
              </p>
            </div>

            <div className="bg-muted p-4 rounded-md space-y-2">
              <h3 className="font-medium">How eNPS is Calculated</h3>
              <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                <li>Promoters (9-10): Employees who are enthusiastic and loyal</li>
                <li>Passives (7-8): Employees who are satisfied but not enthusiastic</li>
                <li>Detractors (0-6): Employees who are unhappy</li>
                <li>eNPS = % Promoters - % Detractors (range: -100 to +100)</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Survey"}
              </Button>
              <Link href="/enps">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
