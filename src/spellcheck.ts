import { StateEffect, Transaction } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import NSpell from 'nspell';
import { findBookBlocks, isBookWord, isLineInBook, lookupName, readLexicon, type Lexicon } from './lexicon';
import { findNoteBlocks, isLineInNotes } from './notes';
import {
  WORD_REGEX_SOURCE,
  isSentenceStart,
  lineOpensSentence,
  straightenApostrophes,
  wordsInLine,
} from './prose';

export { WORD_REGEX_SOURCE };

export const spellcheckReadyEffect = StateEffect.define<void>();

let spellEn: NSpell | null = null;
let ptWords: Set<string> | null = null;
let spellEnReady = false;

const DEBOUNCE_MS = 200;
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
  userWords.add(straightenApostrophes(word).toLowerCase());
  saveUserDict();
}

export function removeFromUserDictionary(word: string): void {
  userWords.delete(straightenApostrophes(word).toLowerCase());
  saveUserDict();
}

export function isInUserDictionary(word: string): boolean {
  return userWords.has(straightenApostrophes(word).toLowerCase());
}

export async function initSpellcheck(): Promise<void> {
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

function liveDict(): SpellDict {
  return {
    spelledOk(straight, lexicon) {
      if (!spellEnReady || !spellEn) return true;
      if (isBookWord(lexicon, straight)) return true;
      return inSpellingDictionary(straight);
    },
    suggest: dictionarySuggestions,
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

function checkLine(
  doc: string,
  lineFrom: number,
  text: string,
  lexicon: Lexicon,
  decorations: { from: number; to: number; value: Decoration }[],
): void {
  const dict = liveDict();
  const spans = wordsInLine(text, lineOpensSentence(doc, lineFrom));
  for (const span of spans) {
    const advice = classifyWord(span.word, span.sentenceStart, lexicon, dict);
    if (advice.kind === 'ok') continue;
    decorations.push({
      from: lineFrom + span.from,
      to: lineFrom + span.to,
      value: misspelledMark,
    });
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  if (!spellEnReady) return Decoration.none;

  const decorations: { from: number; to: number; value: Decoration }[] = [];
  const docText = view.state.doc.toString();
  const noteBlocks = findNoteBlocks(docText);
  const bookBlocks = findBookBlocks(docText);
  const lexicon = readLexicon(docText);
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const text = line.text;

      if (
        !isLineInNotes(noteBlocks, line.from) &&
        !isLineInBook(bookBlocks, line.from) &&
        !/^#{1,3}\s/.test(text)
      ) {
        checkLine(docText, line.from, text, lexicon, decorations);
      }

      if (line.number >= doc.lines) break;
      pos = line.to + 1;
    }
  }

  return Decoration.set(decorations.sort((a, b) => a.from - b.from));
}

export const spellcheckPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      this.view = update.view;
      const readyNow = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(spellcheckReadyEffect)),
      );

      if (readyNow || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
        return;
      }

      if (update.docChanged) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.view.dispatch({
            effects: spellcheckReadyEffect.of(),
            annotations: Transaction.addToHistory.of(false),
          });
        }, DEBOUNCE_MS);
      }
    }

    destroy() {
      clearTimeout(this.timer);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export function refreshSpellcheck(view: EditorView): void {
  if (!spellEnReady) return;
  view.dispatch({ effects: spellcheckReadyEffect.of() });
}
