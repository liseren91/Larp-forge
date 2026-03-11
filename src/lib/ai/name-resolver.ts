import { db } from "@/lib/db";

/**
 * Dice coefficient (bigram similarity) between two strings.
 * Returns a value between 0 and 1.
 */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.slice(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1);
  }

  let intersections = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.slice(i, i + 2);
    const count = bigramsA.get(bigram) ?? 0;
    if (count > 0) {
      bigramsA.set(bigram, count - 1);
      intersections++;
    }
  }

  return (2 * intersections) / (a.length - 1 + (b.length - 1));
}

interface ResolvedCharacter {
  id: string;
  name: string;
  confidence: number;
}

/**
 * Resolve a character name to an entity ID using fuzzy matching.
 * Tries: exact match -> case-insensitive -> substring -> bigram similarity.
 */
export async function resolveCharacterName(
  gameId: string,
  name: string
): Promise<ResolvedCharacter | null> {
  const entities = await db.gameEntity.findMany({
    where: { gameId },
    select: { id: true, name: true },
  });

  if (entities.length === 0) return null;

  // 1. Exact match
  const exact = entities.find((e) => e.name === name);
  if (exact) return { id: exact.id, name: exact.name, confidence: 1.0 };

  const nameLower = name.toLowerCase().trim();

  // 2. Case-insensitive exact match
  const ciExact = entities.find((e) => e.name.toLowerCase().trim() === nameLower);
  if (ciExact) return { id: ciExact.id, name: ciExact.name, confidence: 0.95 };

  // 3. Substring match (name contains query or query contains name)
  const substring = entities.find(
    (e) =>
      e.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(e.name.toLowerCase())
  );
  if (substring) return { id: substring.id, name: substring.name, confidence: 0.8 };

  // 4. Bigram similarity with threshold
  const THRESHOLD = 0.4;
  let bestMatch: ResolvedCharacter | null = null;

  for (const entity of entities) {
    const score = diceCoefficient(nameLower, entity.name.toLowerCase());
    if (score >= THRESHOLD && (!bestMatch || score > bestMatch.confidence)) {
      bestMatch = { id: entity.id, name: entity.name, confidence: score };
    }
  }

  return bestMatch;
}

/**
 * Resolve a plotline name to an ID using fuzzy matching.
 */
export async function resolvePlotlineName(
  gameId: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  const plotlines = await db.plotline.findMany({
    where: { gameId },
    select: { id: true, name: true },
  });

  const exact = plotlines.find((p) => p.name === name);
  if (exact) return exact;

  const nameLower = name.toLowerCase().trim();
  const ciExact = plotlines.find((p) => p.name.toLowerCase().trim() === nameLower);
  if (ciExact) return ciExact;

  const substring = plotlines.find(
    (p) =>
      p.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(p.name.toLowerCase())
  );
  if (substring) return substring;

  return null;
}
