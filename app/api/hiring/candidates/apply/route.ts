import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { candidates } from "@/lib/db/schema";

// Simple in-memory rate limiter (for production, use Redis or Vercel KV)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);

  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 }); // 1 minute window
    return true;
  }

  if (limit.count >= 3) {
    // Max 3 submissions per minute
    return false;
  }

  limit.count++;
  return true;
}

export async function POST(request: NextRequest) {
  // Public endpoint - strict security controls
  
  try {
    // Rate limiting by IP
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Size limit check (already enforced by Next.js serverActions.bodySizeLimit, but double-check)
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 10240) {
      // 10KB max
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      );
    }

    const data = await request.json();

    // Honeypot check
    if (data.website || data.url || data.homepage) {
      console.log("Honeypot triggered:", { ip, data });
      // Silently accept but don't save (fake success response)
      return NextResponse.json({ success: true });
    }

    // Input validation
    if (!data.jobOpeningId || !data.firstName || !data.lastName || !data.email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Length validation
    if (
      data.firstName.length > 100 ||
      data.lastName.length > 100 ||
      data.email.length > 255 ||
      (data.phone && data.phone.length > 50)
    ) {
      return NextResponse.json(
        { error: "Input too long" },
        { status: 400 }
      );
    }

    // Sanitize inputs (basic)
    const sanitize = (str: string) => str.trim().slice(0, 255);

    const [candidate] = await db
      .insert(candidates)
      .values({
        jobOpeningId: parseInt(data.jobOpeningId),
        firstName: sanitize(data.firstName),
        lastName: sanitize(data.lastName),
        email: sanitize(data.email),
        phone: data.phone ? sanitize(data.phone) : null,
        source: "direct",
        stage: "new",
        appliedAt: new Date(),
      })
      .returning();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to submit application:", error);
    return NextResponse.json(
      { error: "Failed to submit application" },
      { status: 500 }
    );
  }
}
