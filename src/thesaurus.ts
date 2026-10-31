export interface SynonymGroup {
  pos: string;
  words: string[];
}

const MAX_WORDS_PER_GROUP = 12;

export const POS = {
  noun: 1,
  verb: 2,
  adj: 4,
  adv: 8,
} as const;

// MyThes th_en_US_v2.dat: encoding line, then repeating blocks of
// `word|meaningCount` followed by meaningCount lines of `(pos)|syn|syn|…`.
// Synonyms may carry annotations like "wood (generic term)" for hypernyms
// or "(antonym)"; only unannotated entries are true synonyms.
// The same file is the bundled WordNet-derived part-of-speech data.
let data = '';
let index: Map<string, number> | null = null;
let posIndex: Map<string, number> | null = null;
let loadPromise: Promise<void> | null = null;

export function thesaurusReady(): boolean {
  return posIndex !== null;
}

export function initThesaurus(): Promise<void> {
  if (!loadPromise) {
    loadPromise = load().catch((error) => {
      console.error('Simple Author: thesaurus failed to load.', error);
      index = new Map();
    });
  }
  return loadPromise;
}

async function fetchThesaurus(): Promise<string> {
  const response = await fetch('./dicts/th_en_US_v2.dat');
  if (!response.ok) throw new Error(`Thesaurus fetch failed (${response.status})`);
  return response.text();
}

function scanThesaurus(text: string, keepOffsets: boolean): { parts: Map<string, number>; offsets: Map<string, number> } {
  const offsets = new Map<string, number>();
  const parts = new Map<string, number>();
  let pos = text.indexOf('\n') + 1;
  while (pos > 0 && pos < text.length) {
    const lineEnd = text.indexOf('\n', pos);
    const line = lineEnd === -1 ? text.slice(pos) : text.slice(pos, lineEnd);
    const bar = line.indexOf('|');
    if (bar === -1) break;
    const head = line.slice(0, bar);
    if (keepOffsets) offsets.set(head, pos);

    const meanings = Number(line.slice(bar + 1));
    if (!Number.isFinite(meanings) || lineEnd === -1) break;
    pos = lineEnd + 1;
    let bits = 0;
    for (let i = 0; i < meanings && pos > 0 && pos < text.length; i++) {
      const meaningEnd = text.indexOf('\n', pos);
      const meaning = meaningEnd === -1 ? text.slice(pos) : text.slice(pos, meaningEnd);
      const pipe = meaning.indexOf('|');
      const label = (pipe === -1 ? meaning : meaning.slice(0, pipe)).toLowerCase();
      if (label.includes('noun')) bits |= POS.noun;
      else if (label.includes('verb')) bits |= POS.verb;
      else if (label.includes('adj')) bits |= POS.adj;
      else if (label.includes('adv')) bits |= POS.adv;
      if (meaningEnd === -1) {
        pos = -1;
        break;
      }
      pos = meaningEnd + 1;
    }
    if (bits) parts.set(head, bits);
  }
  return { parts, offsets };
}

async function load(): Promise<void> {
  // Keep the part-of-speech map and drop the 18MB source. Synonym lookup
  // reads the file again the first time a word is right-clicked.
  const scanned = scanThesaurus(await fetchThesaurus(), false);
  posIndex = scanned.parts;
}

async function ensureSynonyms(): Promise<void> {
  if (data && index) return;
  data = await fetchThesaurus();
  index = scanThesaurus(data, true).offsets;
}

export interface ThesaurusResult {
  headword: string;
  groups: SynonymGroup[];
}

// The thesaurus only lists base forms, so fall back from common
// inflections: walked→walk, fading→fade, carries→carry, stopped→stop.
function lookupCandidates(key: string): string[] {
  const list = [key];
  if (key.endsWith('ies')) list.push(`${key.slice(0, -3)}y`);
  if (key.endsWith('es')) list.push(key.slice(0, -2));
  if (key.endsWith('s')) list.push(key.slice(0, -1));
  if (key.endsWith('ed')) {
    list.push(key.slice(0, -2), key.slice(0, -1));
    if (key.length > 4 && key[key.length - 3] === key[key.length - 4]) {
      list.push(key.slice(0, -3));
    }
  }
  if (key.endsWith('ing') && key.length > 4) {
    const base = key.slice(0, -3);
    list.push(base, `${base}e`);
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      list.push(base.slice(0, -1));
    }
  }
  return list;
}

// Unannotated entries are direct synonyms. "(similar term)" marks WordNet's
// near-synonyms — for adjectives these are usually the only useful entries —
// while generic/related/antonym annotations are not substitutions at all.
function cleanSynonym(part: string): string | null {
  if (!part.includes('(')) return part.trim() || null;
  const similar = part.match(/^(.*?)\s*\(similar term\)$/);
  return similar ? similar[1].trim() || null : null;
}

export function lookupPos(word: string): number {
  if (!posIndex) return 0;
  let bits = 0;
  for (const candidate of lookupCandidates(word.toLowerCase())) {
    bits |= posIndex.get(candidate) ?? 0;
  }
  return bits;
}

export function hasPos(word: string, bit: number): boolean {
  return (lookupPos(word) & bit) !== 0;
}

export async function lookupSynonyms(word: string): Promise<ThesaurusResult | null> {
  await initThesaurus();
  try {
    await ensureSynonyms();
  } catch (error) {
    console.error('Simple Author: thesaurus failed to load.', error);
    return null;
  }
  if (!index || !data) return null;

  let headword = '';
  let offset: number | undefined;
  for (const candidate of lookupCandidates(word.toLowerCase())) {
    offset = index.get(candidate);
    if (offset !== undefined) {
      headword = candidate;
      break;
    }
  }
  if (offset === undefined) return null;

  const headerEnd = data.indexOf('\n', offset);
  const meanings = Number(data.slice(data.indexOf('|', offset) + 1, headerEnd));

  const groups: SynonymGroup[] = [];
  const seen = new Set<string>([headword]);
  let pos = headerEnd + 1;
  for (let i = 0; i < meanings && pos > 0 && pos < data.length; i++) {
    const lineEnd = data.indexOf('\n', pos);
    const line = lineEnd === -1 ? data.slice(pos) : data.slice(pos, lineEnd);
    pos = lineEnd + 1;

    const parts = line.split('|');
    const words: string[] = [];
    for (const part of parts.slice(1)) {
      const cleaned = cleanSynonym(part);
      if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
      seen.add(cleaned.toLowerCase());
      words.push(cleaned);
      if (words.length >= MAX_WORDS_PER_GROUP) break;
    }
    if (words.length > 0) {
      groups.push({ pos: parts[0].replace(/[()]/g, ''), words });
    }
  }
  return groups.length > 0 ? { headword, groups } : null;
}
