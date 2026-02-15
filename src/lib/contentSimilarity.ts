type SimilarityHit = {
  text: string;
  score: number;
};

export function normalizeContentText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentTokenSet(input: string): Set<string> {
  const normalized = normalizeContentText(input);
  if (!normalized) return new Set();
  const raw = normalized.split(" ");
  const tokens = raw.filter((t) => t.length >= 4);
  return new Set(tokens);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

export function bestSimilarityHit(candidate: string, corpus: string[]): SimilarityHit | null {
  const candNorm = normalizeContentText(candidate);
  if (!candNorm) return null;
  const candTokens = contentTokenSet(candNorm);

  let best: SimilarityHit | null = null;
  for (const text of corpus) {
    const norm = normalizeContentText(text);
    if (!norm) continue;
    const tokens = contentTokenSet(norm);
    const score = jaccardSimilarity(candTokens, tokens);
    const directContain = candNorm.includes(norm) || norm.includes(candNorm) ? 0.99 : 0;
    const finalScore = Math.max(score, directContain);
    if (!best || finalScore > best.score) {
      best = { text, score: finalScore };
    }
  }
  return best;
}
