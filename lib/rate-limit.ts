import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: Date;
}

/**
 * DB-backed rate limiter for serverless environments
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMs);

  try {
    // Find or create rate limit record
    const [existing] = await db
      .select()
      .from(rateLimits)
      .where(
        and(
          eq(rateLimits.identifier, identifier),
          eq(rateLimits.endpoint, endpoint)
        )
      )
      .limit(1);

    if (!existing) {
      // First request - create record
      await db.insert(rateLimits).values({
        identifier,
        endpoint,
        attempts: 1,
        windowStart: now,
      });

      return {
        success: true,
        remaining: config.maxAttempts - 1,
        reset: new Date(now.getTime() + config.windowMs),
      };
    }

    // Check if window has expired
    if (existing.windowStart < windowStart) {
      // Reset window
      await db
        .update(rateLimits)
        .set({
          attempts: 1,
          windowStart: now,
          updatedAt: now,
        })
        .where(eq(rateLimits.id, existing.id));

      return {
        success: true,
        remaining: config.maxAttempts - 1,
        reset: new Date(now.getTime() + config.windowMs),
      };
    }

    // Within window - check limit
    if (existing.attempts >= config.maxAttempts) {
      return {
        success: false,
        remaining: 0,
        reset: new Date(existing.windowStart.getTime() + config.windowMs),
      };
    }

    // Increment attempts
    await db
      .update(rateLimits)
      .set({
        attempts: sql`${rateLimits.attempts} + 1`,
        updatedAt: now,
      })
      .where(eq(rateLimits.id, existing.id));

    return {
      success: true,
      remaining: config.maxAttempts - (existing.attempts + 1),
      reset: new Date(existing.windowStart.getTime() + config.windowMs),
    };
  } catch (error) {
    console.error("Rate limit check error:", error);
    // Fail open in case of DB errors
    return {
      success: true,
      remaining: config.maxAttempts,
      reset: new Date(now.getTime() + config.windowMs),
    };
  }
}

/**
 * Clean up old rate limit records
 */
export async function cleanupRateLimits(olderThanMs: number = 86400000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  await db
    .delete(rateLimits)
    .where(sql`${rateLimits.windowStart} < ${cutoff}`);
}
