// Pronunciation-based tools built on the CMU Pronouncing Dictionary:
// exact syllable counts and rhyme lookup, both fully offline.

const pronunciations = new Map<string, string>();
let rhymeIndex: Map<string, string[]> | null = null;
let loadPromise: Promise<void> | null = null;
let loaded = false;

export function initPhonetics(): Promise<void> {
  if (!loadPromise) {
    loadPromise = load().catch((error) => {
      console.error('Simple Author: pronunciation dictionary failed to load.', error);
    });
  }
  return loadPromise;
}

export function phoneticsReady(): boolean {
  return loaded;
}

async function load(): Promise<void> {
  const response = await fetch('./dicts/cmudict.dict');
  if (!response.ok) throw new Error(`cmudict fetch failed (${response.status})`);
  const text = await response.text();

  for (const line of text.split('\n')) {
    const space = line.indexOf(' ');
    if (space <= 0) continue;
    let word = line.slice(0, space);
    // Alternate pronunciations look like "word(2)"; the first one wins.
    if (word.endsWith(')')) continue;
    if (!/^[a-z']+$/.test(word)) continue;
    pronunciations.set(word, line.slice(space + 1).trim());
  }
  loaded = true;
}

// --- Syllables ---

// Vowel phonemes carry a stress digit (AH0, EY1, …), so syllables = digits.
function syllablesFromPhonemes(phonemes: string): number {
  const matches = phonemes.match(/\d/g);
  return matches ? matches.length : 1;
}

// Fallback for words the dictionary doesn't know (names, invented words).
// Vowel-group counting with a silent-e adjustment; right ~90% of the time.
export function syllableHeuristic(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
  if (!clean) return 0;
  const groups = clean.match(/[aeiouyáàãâéêíóõôúü]+/g);
  let count = groups ? groups.length : 1;
  if (clean.length > 2 && clean.endsWith('e') && !clean.endsWith('le')) {
    const beforeE = clean[clean.length - 2];
    if (!'aeiouy'.includes(beforeE)) count--;
  }
  return Math.max(1, count);
}

export function syllableCount(word: string): number {
  const phonemes = pronunciations.get(word.toLowerCase());
  return phonemes ? syllablesFromPhonemes(phonemes) : syllableHeuristic(word);
}

const WORD_IN_LINE = /[a-zA-ZÀ-ÿ]+(?:'[a-zA-ZÀ-ÿ]+)?/g;

export function syllablesInLine(text: string): number {
  let total = 0;
  WORD_IN_LINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_IN_LINE.exec(text)) !== null) {
    total += syllableCount(match[0]);
  }
  return total;
}

// --- Rhymes ---

// Perfect-rhyme key: everything from the last primary-stressed vowel onward
// (falling back to any last stressed vowel, then the last vowel).
function rhymeKey(phonemes: string): string | null {
  const parts = phonemes.split(' ');
  const vowelAt = (test: (p: string) => boolean) => {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (test(parts[i])) return i;
    }
    return -1;
  };
  let idx = vowelAt((p) => p.endsWith('1'));
  if (idx === -1) idx = vowelAt((p) => p.endsWith('2'));
  if (idx === -1) idx = vowelAt((p) => /\d/.test(p));
  if (idx === -1) return null;
  return parts.slice(idx).join(' ');
}

// Slant-rhyme key: the sounds after the last stressed vowel, so words with
// the same ending but a different vowel land together — moon/stone/line
// (…N), water/butter/later (…T ER0). Perfect rhymes share the bucket and
// are filtered out by the caller.
function slantKey(phonemes: string): string | null {
  const key = rhymeKey(phonemes);
  if (key === null) return null;
  return key.split(' ').slice(1).join(' ');
}

let slantIndex: Map<string, string[]> | null = null;

function buildIndexes(): void {
  rhymeIndex = new Map();
  slantIndex = new Map();
  for (const [word, phonemes] of pronunciations) {
    if (word.length < 2) continue;
    const key = rhymeKey(phonemes);
    if (!key) continue;
    const list = rhymeIndex.get(key);
    if (list) list.push(word);
    else rhymeIndex.set(key, [word]);

    const slant = slantKey(phonemes);
    if (slant !== null && slant !== '') {
      const slantList = slantIndex.get(slant);
      if (slantList) slantList.push(word);
      else slantIndex.set(slant, [word]);
    }
  }
}

export interface RhymeResult {
  perfect: string[];
  slant: string[];
}

export async function lookupRhymes(
  word: string,
  isRealWord: (w: string) => boolean,
  limit = 14,
): Promise<RhymeResult | null> {
  await initPhonetics();
  const phonemes = pronunciations.get(word.toLowerCase());
  if (!phonemes) return null;
  if (!rhymeIndex || !slantIndex) buildIndexes();

  const key = rhymeKey(phonemes);
  const coda = slantKey(phonemes);
  if (!key) return null;

  const lower = word.toLowerCase();
  const seen = new Set<string>([lower]);
  const pick = (candidates: string[], out: string[]) => {
    for (const candidate of candidates) {
      if (out.length >= limit) break;
      if (candidate.length < 3 || seen.has(candidate)) continue;
      // Skip trivial rhymes that merely append a prefix to the same word.
      if (candidate.endsWith(lower) || lower.endsWith(candidate)) continue;
      if (!isRealWord(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
  };

  const perfect: string[] = [];
  const perfectSet = new Set(rhymeIndex!.get(key) ?? []);
  pick([...perfectSet].sort(bySimplicity), perfect);

  const slant: string[] = [];
  if (coda) {
    const candidates = (slantIndex!.get(coda) ?? []).filter((w) => !perfectSet.has(w));
    pick(candidates.sort(bySimplicity), slant);
  }

  if (perfect.length === 0 && slant.length === 0) return null;
  return { perfect, slant };
}

// Short common-looking words first; without frequency data, brevity is the
// best available proxy for usefulness.
function bySimplicity(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b);
}
