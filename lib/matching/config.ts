/** Server-only Anthropic / matching cost controls. Never expose to the client. */

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

export function matchingConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = (env.ANTHROPIC_API_KEY || "").trim();
  const model = (env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL).trim();
  const maxCandidates = clampInt(env.ANTHROPIC_MATCH_MAX_CANDIDATES, 20, 1, 40);
  const maxInputTokens = clampInt(env.ANTHROPIC_MATCH_MAX_INPUT_TOKENS, 40_000, 4_000, 200_000);
  const maxOutputTokens = clampInt(env.ANTHROPIC_MATCH_MAX_OUTPUT_TOKENS, 4_096, 256, 16_384);
  const maxUncachedResumes = clampInt(env.ANTHROPIC_MATCH_MAX_UNCACHED_RESUMES, 12, 0, 40);
  const rateLimitMax = clampInt(env.ANTHROPIC_MATCH_RATE_LIMIT, 5, 1, 30);
  const rateLimitWindowMs = clampInt(env.ANTHROPIC_MATCH_RATE_WINDOW_MS, 10 * 60_000, 30_000, 60 * 60_000);
  return {
    apiKey,
    model,
    maxCandidates,
    maxInputTokens,
    maxOutputTokens,
    maxUncachedResumes,
    rateLimitMax,
    rateLimitWindowMs,
  };
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const n = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
