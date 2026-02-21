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

function charNGramSet(input: string, n = 3): Set<string> {
  const normalized = normalizeContentText(input).replace(/\s+/g, " ");
  if (!normalized) return new Set();
  if (normalized.length <= n) return new Set([normalized]);
  const grams = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i += 1) {
    grams.add(normalized.slice(i, i + n));
  }
  return grams;
}

function diceSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const g of a) {
    if (b.has(g)) intersection += 1;
  }
  return (2 * intersection) / (a.size + b.size);
}

export function similarityScore(a: string, b: string): number {
  const na = normalizeContentText(a);
  const nb = normalizeContentText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const contains = na.includes(nb) || nb.includes(na) ? 0.98 : 0;
  const tokens = jaccardSimilarity(contentTokenSet(na), contentTokenSet(nb));
  const trigrams = diceSimilarity(charNGramSet(na, 3), charNGramSet(nb, 3));

  // Weighted blend for near-duplicate detection, then boosted by hard signals.
  const blended = tokens * 0.55 + trigrams * 0.45;
  return Math.max(contains, blended);
}

export function bestSimilarityHit(candidate: string, corpus: string[]): SimilarityHit | null {
  const candNorm = normalizeContentText(candidate);
  if (!candNorm) return null;

  let best: SimilarityHit | null = null;
  for (const text of corpus) {
    const norm = normalizeContentText(text);
    if (!norm) continue;
    const finalScore = similarityScore(candNorm, norm);
    if (!best || finalScore > best.score) {
      best = { text, score: finalScore };
    }
  }
  return best;
}
