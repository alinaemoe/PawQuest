import { haversineDistanceM, type LatLon } from '../geo/haversine';

/** Place types the dictionary can infer from a name (spec A-24). `other` is chosen by the user. */
export type InferredCategory =
  'park' | 'meadow' | 'yard' | 'district' | 'forest' | 'waterfront' | 'dog_area' | 'street' | 'vet';

const MAX_NAME_LENGTH = 40;
const STOP_WORDS = new Set(['у', 'возле', 'около', 'на', 'в', 'за', 'к']);

/** Word-start/word-form patterns per category, checked in this order for every word. */
const CATEGORY_PATTERNS: readonly (readonly [InferredCategory, RegExp])[] = [
  ['park', /^(парк(?!овк|инг)|сквер|park(?!ing))/],
  ['meadow', /^(луг|лужайк|полян|пустыр|meadow|field)|^пол(е|я|ю|ем|ях|ями)$/],
  ['yard', /^(двор(а|у|е|ом|ы|ов)?|дворик(а|у|е|ом|и|ов)?|yard)$/],
  ['district', /^(район|микрорайон|мкр$|квартал|district)/],
  [
    'forest',
    /^(лес|леса|лесу|лесе|лесом|лесн\p{L}*|лесок|лесопарк\p{L}*|рощ\p{L}*|forest|woods?)$/u,
  ],
  [
    'waterfront',
    /^(набереж\p{L}*|пруд\p{L}*|озер\p{L}*|рек(а|у|и|е|ой)|речк\p{L}*|пляж\p{L}*|водоем\p{L}*|lake|river|beach)$/u,
  ],
  ['dog_area', /^площадк\p{L}*$/u],
  ['street', /^(улиц\p{L}*|проспект\p{L}*|бульвар\p{L}*|переул\p{L}*|street|road)$/u],
  ['vet', /^(ветклиник\p{L}*|ветеринар\p{L}*|клиник\p{L}*|vets?)$/u],
];

// A base character with its combining marks, joined into one unit across zero-width joiners
// (emoji sequences such as family emoji). This approximates grapheme clusters without the
// Intl segmenter API, which the Hermes engine of React Native does not implement (verified on
// a Galaxy S23: constructing it crashed the app at start-up).
const GRAPHEME = /\P{M}\p{M}*(?:‍\P{M}\p{M}*)*/gu;

/** Splits text into user-perceived characters. */
function chars(text: string): string[] {
  return text.match(GRAPHEME) ?? [];
}

function words(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/**
 * Cleans a user-entered place name for display (spec A-24, step 1): removes emoji and stray
 * punctuation, collapses spaces, limits to 40 characters, turns SHOUTED words into lower case and
 * capitalises the first letter. Returns '' if nothing usable is left.
 */
export function tidyName(raw: string): string {
  const cleaned = raw
    .replace(/[^\p{L}\p{N} \-']+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const limited = chars(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
  // All caps: lower everything. Mixed case: lower only SHOUTED words of 2+ letters, so a lone
  // capital (an initial, "А. Пушкин") is left alone.
  const allCaps = limited !== limited.toLowerCase() && limited === limited.toUpperCase();
  const calmed = allCaps
    ? limited.toLowerCase()
    : limited
        .split(' ')
        .map((w) =>
          w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase() ? w.toLowerCase() : w,
        )
        .join(' ');
  const first = chars(calmed)[0];
  return first === undefined ? '' : first.toUpperCase() + calmed.slice(first.length);
}

/**
 * Comparison key `name_norm` (spec A-24, step 2): lower case, "ё" as "е", punctuation removed,
 * service words dropped and the remaining words sorted, so "Парк у дома" and "парк дома" match.
 */
export function nameKey(raw: string): string {
  return words(raw)
    .filter((w) => !STOP_WORDS.has(w))
    .sort()
    .join(' ');
}

/**
 * Place type inferred from the first word that contains a known root (spec A-24, step 3, D-51).
 * Returns null when no word matches; the user then picks the type.
 */
export function guessCategory(raw: string): InferredCategory | null {
  const tokens = words(raw);
  for (const [i, token] of tokens.entries()) {
    if (token === 'dog' && tokens[i + 1] === 'park') {
      return 'dog_area';
    }
    for (const [category, pattern] of CATEGORY_PATTERNS) {
      if (pattern.test(token)) {
        return category;
      }
    }
  }
  return null;
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

function levenshtein(a: string, b: string): number {
  const left = chars(a);
  const right = chars(b);
  let previous = Array.from({ length: right.length + 1 }, (_, j) => j);
  for (const [i, ca] of left.entries()) {
    const row = [i + 1];
    for (const [j, cb] of right.entries()) {
      row.push(
        Math.min(
          (previous[j + 1] ?? 0) + 1,
          (row[j] ?? 0) + 1,
          (previous[j] ?? 0) + (ca === cb ? 0 : 1),
        ),
      );
    }
    previous = row;
  }
  return previous[right.length] ?? 0;
}

/**
 * Similarity of two name keys in [0, 1]: the larger of the trigram Jaccard index and
 * 1 - Levenshtein / longest length (spec A-24, step 4). Two empty keys give 0.
 */
export function nameSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) {
    return 0;
  }
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const g of ta) {
    if (tb.has(g)) {
      shared += 1;
    }
  }
  const jaccard = shared / (ta.size + tb.size - shared);
  const edit = 1 - levenshtein(a, b) / Math.max(chars(a).length, chars(b).length);
  return Math.max(jaccard, edit);
}

/** A saved place as needed for duplicate detection. */
export interface LibraryPlace {
  readonly id: string;
  /** Its `name_norm` key. */
  readonly nameNorm: string;
  readonly category?: string | undefined;
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly radiusM?: number | undefined;
  /** Name keys the owner has confirmed to mean this place. */
  readonly aliases?: readonly string[] | undefined;
}

export interface DuplicateCandidate {
  readonly id: string;
  /** 1 for an alias, the name similarity for a name match, at least 0.6 for a location match. */
  readonly score: number;
  readonly reason: 'alias' | 'name' | 'geo';
}

export interface FindDuplicatesOptions {
  /** Where the new place is, if known: enables the same-type-and-within-radius check. */
  readonly point?: LatLon | undefined;
  /** Type of the new place; defaults to the type guessed from the name. */
  readonly category?: string | null | undefined;
}

const SIMILARITY_THRESHOLD = 0.6;
const MAX_CANDIDATES = 3;
const REASON_RANK = { alias: 0, name: 1, geo: 2 } as const;

/**
 * Finds saved places the new name probably refers to (spec A-24, step 4, D-51): an alias match,
 * a name similarity of at least 0.6, or the same type within the saved place's radius.
 * At most 3 candidates, best first.
 */
export function findDuplicates(
  raw: string,
  library: readonly LibraryPlace[],
  options: FindDuplicatesOptions = {},
): DuplicateCandidate[] {
  const key = nameKey(raw);
  if (key.length === 0) {
    return [];
  }
  const category = options.category === undefined ? guessCategory(raw) : options.category;
  const found: DuplicateCandidate[] = [];
  for (const place of library) {
    let candidate: DuplicateCandidate | null = null;
    if (place.aliases?.includes(key) === true) {
      candidate = { id: place.id, score: 1, reason: 'alias' };
    } else {
      const similarity = nameSimilarity(key, place.nameNorm);
      if (similarity >= SIMILARITY_THRESHOLD) {
        candidate = { id: place.id, score: similarity, reason: 'name' };
      }
    }
    const withinRadius =
      options.point !== undefined &&
      place.lat !== undefined &&
      place.lon !== undefined &&
      category !== null &&
      category === place.category &&
      haversineDistanceM(options.point, { lat: place.lat, lon: place.lon }) <=
        (place.radiusM ?? 60);
    if (withinRadius && candidate === null) {
      candidate = { id: place.id, score: SIMILARITY_THRESHOLD, reason: 'geo' };
    }
    if (candidate !== null) {
      found.push(candidate);
    }
  }
  return found
    .sort(
      (a, b) =>
        b.score - a.score ||
        REASON_RANK[a.reason] - REASON_RANK[b.reason] ||
        a.id.localeCompare(b.id),
    )
    .slice(0, MAX_CANDIDATES);
}

/**
 * Default name for a place entered without a name (spec A-24, step 7): the type label, or the
 * label with the first free number from 2 ("Луг", "Луг 2", "Луг 3") when it is already taken.
 */
export function defaultPlaceName(label: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  if (!taken.has(label.trim().toLowerCase())) {
    return label;
  }
  for (let n = 2; ; n++) {
    const candidate = `${label} ${String(n)}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}
