// Per-book names and invented words, stored in the manuscript so they travel
// with the file. Names keep their capital letter; other words are a private
// spelling list. Neither is the global personal dictionary.
//
// [Book]
// @Elara
// glowmoss
// [/Book]

import type { EditorView } from '@codemirror/view';
import { straightenApostrophes } from './prose';

export const BOOK_OPEN = '[Book]';
export const BOOK_CLOSE = '[/Book]';

const OPEN_PATTERN = /^\[Book\]$/i;
const CLOSE_PATTERN = /^\[\/Book\]$/i;

export interface BookBlock {
  start: number;
  end: number;
}

export interface Lexicon {
  // Lowercase key → the spelling that should appear in prose, e.g. "elara" → "Elara".
  names: Map<string, string>;
  // Lowercase invented words that are not proper names.
  words: Set<string>;
}

export function emptyLexicon(): Lexicon {
  return { names: new Map(), words: new Set() };
}

export function findBookBlocks(doc: string): BookBlock[] {
  const lines = doc.split('\n');
  const blocks: BookBlock[] = [];
  let offset = 0;
  let blockStart = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (OPEN_PATTERN.test(trimmed)) {
      blockStart = offset;
    } else if (CLOSE_PATTERN.test(trimmed) && blockStart >= 0) {
      blocks.push({ start: blockStart, end: offset + line.length + 1 });
      blockStart = -1;
    }
    offset += line.length + 1;
  }

  return blocks;
}

export function isLineInBook(blocks: BookBlock[], lineFrom: number): boolean {
  return blocks.some((block) => lineFrom >= block.start && lineFrom < block.end);
}

export function stripBookBlocks(doc: string): string {
  const blocks = findBookBlocks(doc);
  if (blocks.length === 0) return doc;

  let result = '';
  let last = 0;
  for (const block of blocks) {
    result += doc.slice(last, block.start);
    last = block.end;
  }
  result += doc.slice(last);
  return result.replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function canonicalName(raw: string): string {
  const straight = straightenApostrophes(raw.trim());
  if (!straight) return '';
  const letters = straight.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const allCaps = letters.length > 1 && letters === letters.toUpperCase();
  const base = allCaps ? straight.charAt(0).toUpperCase() + straight.slice(1).toLowerCase() : straight;
  if (base === base.toLowerCase()) return base.charAt(0).toUpperCase() + base.slice(1);
  return base;
}

export function readLexicon(doc: string): Lexicon {
  const lex = emptyLexicon();
  const lines = doc.split('\n');
  let inside = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (OPEN_PATTERN.test(trimmed)) {
      inside = true;
      continue;
    }
    if (CLOSE_PATTERN.test(trimmed)) {
      inside = false;
      continue;
    }
    if (!inside || !trimmed) continue;
    if (trimmed.startsWith('@')) {
      const name = canonicalName(trimmed.slice(1));
      if (name) lex.names.set(name.toLowerCase(), name);
    } else {
      const word = straightenApostrophes(trimmed).toLowerCase();
      if (word) lex.words.add(word);
    }
  }
  return lex;
}

export function lookupName(lex: Lexicon, word: string): string | null {
  const straight = straightenApostrophes(word);
  const possessive = straight.match(/^(.*?)(['’]s)$/i);
  const base = possessive ? possessive[1] : straight;
  return lex.names.get(base.toLowerCase()) ?? null;
}

export function isBookWord(lex: Lexicon, word: string): boolean {
  const straight = straightenApostrophes(word).replace(/['’]s$/i, '');
  return lex.words.has(straight.toLowerCase());
}

interface LexChange {
  from: number;
  to: number;
  insert: string;
}

function serialize(lex: Lexicon): string {
  const names = [...lex.names.values()].sort((a, b) => a.localeCompare(b));
  const words = [...lex.words].sort((a, b) => a.localeCompare(b));
  const lines = [...names.map((name) => `@${name}`), ...words];
  if (lines.length === 0) return '';
  return `${BOOK_OPEN}\n${lines.join('\n')}\n${BOOK_CLOSE}\n`;
}

export function lexiconChanges(doc: string, lex: Lexicon): LexChange[] {
  const blocks = findBookBlocks(doc);
  const body = serialize(lex);
  if (blocks.length === 0) {
    if (!body) return [];
    let insert = body;
    if (doc.length > 0 && !doc.endsWith('\n')) insert = `\n\n${body}`;
    else if (doc.endsWith('\n') && !doc.endsWith('\n\n')) insert = `\n${body}`;
    return [{ from: doc.length, to: doc.length, insert }];
  }

  const changes: LexChange[] = [{ from: blocks[0].start, to: Math.min(doc.length, blocks[0].end), insert: body }];
  for (let i = 1; i < blocks.length; i++) {
    changes.push({ from: blocks[i].start, to: Math.min(doc.length, blocks[i].end), insert: '' });
  }
  return changes;
}

function dispatchLexicon(view: EditorView, mutate: (lex: Lexicon) => void): void {
  const doc = view.state.doc.toString();
  const lex = readLexicon(doc);
  mutate(lex);
  const changes = lexiconChanges(doc, lex);
  if (changes.length === 0) return;
  view.dispatch({ changes });
}

export function addName(view: EditorView, raw: string): void {
  const name = canonicalName(raw);
  if (!name) return;
  dispatchLexicon(view, (lex) => {
    lex.names.set(name.toLowerCase(), name);
    lex.words.delete(name.toLowerCase());
  });
}

export function removeName(view: EditorView, raw: string): void {
  const key = straightenApostrophes(raw).replace(/['’]s$/i, '').toLowerCase();
  dispatchLexicon(view, (lex) => {
    lex.names.delete(key);
  });
}

export function addBookWord(view: EditorView, raw: string): void {
  const word = straightenApostrophes(raw).replace(/['’]s$/i, '').toLowerCase();
  if (!word || word.length < 2) return;
  dispatchLexicon(view, (lex) => {
    if (lex.names.has(word)) return;
    lex.words.add(word);
  });
}

export function removeBookWord(view: EditorView, raw: string): void {
  const word = straightenApostrophes(raw).replace(/['’]s$/i, '').toLowerCase();
  dispatchLexicon(view, (lex) => {
    lex.words.delete(word);
  });
}
