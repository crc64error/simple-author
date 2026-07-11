import { StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import NSpell from 'nspell';
import { findNoteBlocks, isLineInNotes } from './notes';

export const spellcheckReadyEffect = StateEffect.define<void>();

let spellEn: NSpell | null = null;
let ptWords: Set<string> | null = null;
let spellEnReady = false;

export const WORD_REGEX_SOURCE = "[a-zA-ZÀ-ÿ]+(?:'[a-zA-ZÀ-ÿ]+)?";
const WORD_PATTERN = new RegExp(WORD_REGEX_SOURCE, 'g');
const DEBOUNCE_MS = 200;

const USER_DICT_KEY = 'simple-writer-user-dict';

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
  userWords.add(word.toLowerCase());
  saveUserDict();
}

export function removeFromUserDictionary(word: string): void {
  userWords.delete(word.toLowerCase());
  saveUserDict();
}

export function isInUserDictionary(word: string): boolean {
  return userWords.has(word.toLowerCase());
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

function isValidWord(word: string): boolean {
  if (!spellEnReady || !spellEn) return true;

  const lower = word.toLowerCase();
  if (lower.length < 2) return true;
  if (/^\d/.test(lower)) return true;

  if (userWords.has(lower)) return true;
  if (spellEn.correct(lower)) return true;
  if (ptWords?.has(lower)) return true;

  return false;
}

export function isMisspelled(word: string): boolean {
  return !isValidWord(word);
}

export function spellSuggestions(word: string, limit = 6): string[] {
  if (!spellEnReady || !spellEn || isValidWord(word)) return [];
  return spellEn.suggest(word).slice(0, limit);
}

const misspelledMark = Decoration.mark({
  class: 'cm-spell-error',
});

function checkLine(
  lineFrom: number,
  text: string,
  decorations: { from: number; to: number; value: Decoration }[],
): void {
  let match: RegExpExecArray | null;
  WORD_PATTERN.lastIndex = 0;
  while ((match = WORD_PATTERN.exec(text)) !== null) {
    const word = match[0];
    if (!isValidWord(word)) {
      decorations.push({
        from: lineFrom + match.index,
        to: lineFrom + match.index + word.length,
        value: misspelledMark,
      });
    }
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  if (!spellEnReady) return Decoration.none;

  const decorations: { from: number; to: number; value: Decoration }[] = [];
  const doc = view.state.doc;
  const noteBlocks = findNoteBlocks(doc.toString());

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const text = line.text;

      if (!isLineInNotes(noteBlocks, line.from) && !/^#{1,3}\s/.test(text)) {
        checkLine(line.from, text, decorations);
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

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const readyNow = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(spellcheckReadyEffect)),
      );

      if (readyNow || update.viewportChanged) {
        this.rebuild(update.view);
        return;
      }

      if (update.docChanged) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.rebuild(update.view), DEBOUNCE_MS);
      }
    }

    destroy() {
      clearTimeout(this.timer);
    }

    private rebuild(view: EditorView): void {
      this.decorations = buildDecorations(view);
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