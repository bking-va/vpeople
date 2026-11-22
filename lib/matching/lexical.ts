/**
 * Cheap English term overlap for shortlisting before the LLM.
 *
 * Production search also runs the same tokens through Postgres
 * `plainto_tsquery` / `to_tsvector` (see retrieve.ts) so ranking stays
 * aligned with FTS. Embeddings were skipped: they add API cost and a vector
 * column for a few thousand employees + ATS rows, while keyword overlap on
 * titles/skills plus an LLM rerank is enough.
 */

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "is",
  "are",
  "be",
  "this",
  "that",
  "we",
  "you",
  "our",
  "your",
  "role",
  "job",
  "will",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length > 1 && !STOP.has(tok));
}

export function lexicalScore(query: string, document: string): number {
  const q = tokenize(query);
  if (q.length === 0) return 0;
  const df = new Map<string, number>();
  for (const tok of tokenize(document)) {
    df.set(tok, (df.get(tok) || 0) + 1);
  }
  if (df.size === 0) return 0;
  let hit = 0;
  const seen = new Set<string>();
  for (const tok of q) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    if (df.has(tok)) hit += 1;
  }
  return hit / seen.size;
}

export function toTsQueryInput(query: string): string {
  return tokenize(query).join(" ");
}
