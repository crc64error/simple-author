import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import NSpell from 'nspell';
import { analysisEffect, analysisSnapshot, invalidateSpellingReuse, scheduleAnalysis } from './analysis';
import { deleteWordVerdict, readWordVerdicts, writeWordVerdicts } from './analysis-cache';
import { isBookWord, lookupName, readLexicon, type Lexicon } from './lexicon';
import { WORD_REGEX_SOURCE, isSentenceStart, straightenApostrophes } from './prose';

export { WORD_REGEX_SOURCE };

let spellEn: NSpell | null = null;
let ptWords: Set<string> | null = null;
let spellEnReady = false;
let spellPromise: Promise<void> | null = null;
const verdicts = new Map<string, boolean>();
const dirtyVerdicts: [string, boolean][] = [];

const USER_DICT_KEY = 'simple-writer-user-dict';

// The pronoun and its contractions are stored capitalized in the dictionary,
// and lowercase "i" is accepted there anyway. Capitalization is our rule.
const I_FORMS: Record<string, string> = {
  i: 'I',
  "i'm": "I'm",
  "i'll": "I'll",
  "i've": "I've",
  "i'd": "I'd",
};

function loadUserDict(): string[] {
  try {
    const raw = localStorage.getItem(USER_DICT_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* corrupt or unavailable storage — start empty */
  }
  return [];
}

const userWords = new Set<string>(loadUserDict());

function saveUserDict(): void {
  try {
    localStorage.setItem(USER_DICT_KEY, JSON.stringify([...userWords].sort()));
  } catch {
    /* storage unavailable */
  }
}

export function addToUserDictionary(word: string): void {
  const key = straightenApostrophes(word).toLowerCase();
  userWords.add(key);
  saveUserDict();
  forgetSpelling(key);
}

export function removeFromUserDictionary(word: string): void {
  const key = straightenApostrophes(word).toLowerCase();
  userWords.delete(key);
  saveUserDict();
  forgetSpelling(key);
}

export function forgetSpelling(word: string): void {
  const key = straightenApostrophes(word).toLowerCase();
  verdicts.delete(key);
  void deleteWordVerdict(key);
}

export function isInUserDictionary(word: string): boolean {
  return userWords.has(straightenApostrophes(word).toLowerCase());
}

export function initSpellcheck(): Promise<void> {
  if (!spellPromise) spellPromise = loadSpellcheck();
  return spellPromise;
}

async function loadSpellcheck(): Promise<void> {
  try {
    const [enAff, enDic] = await Promise.all([fetchDict('en.aff'), fetchDict('en.dic')]);
    spellEn = new NSpell(enAff, enDic);
    spellEnReady = true;
  } catch (error) {
    console.error('Simple Author: English spellcheck failed to load.', error);
  }

  try {
    ptWords = await loadPortugueseWordSet();
  } catch (error) {
    console.error('Simple Author: Portuguese word list failed to load.', error);
  }
}

export function spellReady(): boolean {
  return spellEnReady;
}

export async function loadSpellingCache(): Promise<void> {
  const stored = await readWordVerdicts();
  for (const [word, ok] of stored) {
    if (!verdicts.has(word)) verdicts.set(word, ok);
  }
}

export async function flushSpellingCache(): Promise<void> {
  if (dirtyVerdicts.length === 0) return;
  const batch = dirtyVerdicts.splice(0);
  await writeWordVerdicts(batch);
}

async function fetchDict(filename: string): Promise<string> {
  const response = await fetch(`./dicts/${filename}`);
  if (!response.ok) {
    throw new Error(`Dictionary fetch failed: ${filename} (${response.status})`);
  }
  return response.text();
}

async function loadPortugueseWordSet(): Promise<Set<string>> {
  const dic = await fetchDict('pt.dic');
  const words = new Set<string>();
  const lines = dic.split('\n');

  for (let i = 1; i < lines.length; i++) {
    const word = lines[i].split('/')[0].trim().toLowerCase();
    if (word) words.add(word);
  }

  return words;
}

function inSpellingDictionary(straight: string): boolean {
  const lower = straight.toLowerCase();
  if (userWords.has(lower)) return true;
  if (spellEn?.correct(straight) || spellEn?.correct(lower)) return true;
  if (ptWords?.has(lower)) return true;
  const stem = lower.replace(/'s$/, '');
  if (stem !== lower && (userWords.has(stem) || ptWords?.has(stem))) return true;
  return false;
}

function dictionarySuggestions(straight: string): string[] {
  if (!spellEn) return [];
  const direct = spellEn.suggest(straight);
  const list = direct.length > 0 ? direct : spellEn.suggest(straight.toLowerCase());
  return list.slice(0, 6);
}

function matchApostrophe(original: string, suggestion: string): string {
  if (original.includes('’') && !original.includes("'")) return suggestion.replace(/'/g, '’');
  return suggestion;
}

function startsLower(word: string): boolean {
  const ch = word.charAt(0);
  return ch !== ch.toUpperCase() && ch === ch.toLowerCase();
}

function hasInternalCaps(word: string): boolean {
  return /[A-ZÀ-Ý]/.test(word.slice(1));
}

export interface WordAdvice {
  kind: 'ok' | 'spelling' | 'capital';
  suggestions: string[];
}

export interface SpellDict {
  spelledOk(straight: string, lexicon: Lexicon): boolean;
  suggest(straight: string): string[];
}

export function classifyWord(
  word: string,
  sentenceStart: boolean,
  lexicon: Lexicon,
  dict: SpellDict,
): WordAdvice {
  const straight = straightenApostrophes(word);
  const styled = (suggestion: string) => matchApostrophe(word, suggestion);

  const iForm = I_FORMS[straight.toLowerCase()];
  if (iForm) {
    if (straight === iForm || straight === iForm.toUpperCase()) return { kind: 'ok', suggestions: [] };
    return { kind: 'capital', suggestions: [styled(iForm)] };
  }

  const name = lookupName(lexicon, straight);
  if (name) {
    const suffix = /'s$/i.test(straight) ? "'s" : '';
    const expected = `${name}${suffix}`;
    if (straight === expected || straight === expected.toUpperCase()) return { kind: 'ok', suggestions: [] };
    return { kind: 'capital', suggestions: [styled(expected)] };
  }

  if (straight.length < 2) {
    if (sentenceStart && startsLower(straight)) {
      return { kind: 'capital', suggestions: [straight.toUpperCase()] };
    }
    return { kind: 'ok', suggestions: [] };
  }

  if (!dict.spelledOk(straight, lexicon)) {
    return { kind: 'spelling', suggestions: dict.suggest(straight).map(styled) };
  }

  if (sentenceStart && startsLower(straight) && !hasInternalCaps(straight)) {
    const fixed = straight.charAt(0).toUpperCase() + straight.slice(1);
    return { kind: 'capital', suggestions: [styled(fixed)] };
  }

  return { kind: 'ok', suggestions: [] };
}

function rememberVerdict(straight: string): boolean {
  const key = straightenApostrophes(straight).toLowerCase();
  const hit = verdicts.get(key);
  if (hit !== undefined) return hit;
  const ok = inSpellingDictionary(straight);
  verdicts.set(key, ok);
  dirtyVerdicts.push([key, ok]);
  return ok;
}

function liveDict(): SpellDict {
  return {
    spelledOk(straight, lexicon) {
      if (!spellEnReady || !spellEn) return true;
      if (isBookWord(lexicon, straight)) return true;
      return rememberVerdict(straight);
    },
    suggest: dictionarySuggestions,
  };
}

// Document scans ask only whether a word is known. Suggestions stay on the
// right-click path, because hunspell's suggestion search is the slow part.
export function spellScanDict(): SpellDict {
  return {
    spelledOk(straight, lexicon) {
      if (!spellEnReady || !spellEn) return true;
      if (isBookWord(lexicon, straight)) return true;
      return rememberVerdict(straight);
    },
    suggest: () => [],
  };
}

export function adviseAt(doc: string, from: number, word: string): WordAdvice {
  return classifyWord(word, isSentenceStart(doc, from), readLexicon(doc), liveDict());
}

function isValidWord(word: string): boolean {
  if (!spellEnReady || !spellEn) return true;
  const straight = straightenApostrophes(word);
  const lower = straight.toLowerCase();
  if (lower.length < 2) return true;
  if (/^\d/.test(lower)) return true;
  return inSpellingDictionary(straight);
}

export function isMisspelled(word: string): boolean {
  return !isValidWord(word);
}

export function spellSuggestions(word: string, limit = 6): string[] {
  if (!spellEnReady || !spellEn || isValidWord(word)) return [];
  return dictionarySuggestions(straightenApostrophes(word)).slice(0, limit);
}

const misspelledMark = Decoration.mark({
  class: 'cm-spell-error',
});

function marksFromCache(view: EditorView): DecorationSet {
  const max = view.state.doc.length;
  const ranges = [];
  for (const chapter of analysisSnapshot().chapters) {
    for (const mark of chapter.spelling) {
      if (mark.from < mark.to && mark.to <= max) ranges.push(misspelledMark.range(mark.from, mark.to));
    }
  }
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

export const spellcheckPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = marksFromCache(view);
      scheduleAnalysis(view);
    }

    update(update: ViewUpdate) {
      // Rebuilding marks here made the viewport stay blank until the scan
      // finished. Scroll paints the cached marks; edits update the cache.
      if (update.docChanged) scheduleAnalysis(update.view);
      const refresh = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(analysisEffect)),
      );
      if (refresh) this.decorations = marksFromCache(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export function refreshSpellcheck(view: EditorView): void {
  invalidateSpellingReuse();
  scheduleAnalysis(view);
}
