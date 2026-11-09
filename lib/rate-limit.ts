import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

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
 * Atomic DB-backed rate limiter. Uses a unique (identifier, endpoint) key and
 * a single INSERT ... ON CONFLICT increment so concurrent requests cannot
 * both observe attempts < max.
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStartCutoff = new Date(now.getTime() - config.windowMs);

  try {
    const rows = await db.execute<{ attempts: number; window_start: Date }>(sql`
      INSERT INTO rate_limits (identifier, endpoint, attempts, window_start, created_at, updated_at)
      VALUES (${identifier}, ${endpoint}, 1, ${now}, ${now}, ${now})
      ON CONFLICT (identifier, endpoint)
      DO UPDATE SET
        attempts = CASE
          WHEN rate_limits.window_start < ${windowStartCutoff} THEN 1
          ELSE rate_limits.attempts + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < ${windowStartCutoff} THEN ${now}
          ELSE rate_limits.window_start
        END,
        updated_at = ${now}
      RETURNING attempts, window_start
    `);

    const row = Array.isArray(rows)
      ? rows[0]
      : (rows as { rows?: Array<{ attempts: number; window_start: Date }> }).rows?.[0];

    if (!row) {
      return { success: false, remaining: 0, reset: new Date(now.getTime() + config.windowMs) };
    }

    const attempts = Number(row.attempts);
    const windowStart = new Date(row.window_start);
    const reset = new Date(windowStart.getTime() + config.windowMs);

    if (attempts > config.maxAttempts) {
      return { success: false, remaining: 0, reset };
    }

    return {
      success: true,
      remaining: Math.max(0, config.maxAttempts - attempts),
      reset,
    };
  } catch (error) {
    console.error("Rate limit check error:", error);
    return {
      success: false,
      remaining: 0,
      reset: new Date(now.getTime() + config.windowMs),
    };
  }
}

export async function cleanupRateLimits(olderThanMs: number = 86400000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  await db
    .delete(rateLimits)
    .where(sql`${rateLimits.windowStart} < ${cutoff}`);
}
