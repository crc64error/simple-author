// Analysis results live in the program's IndexedDB database, which the
// browser stores on disk. The manuscript file is left untouched, and the
// checks are not rebuilt while the writer scrolls.

import type { GrammarIssue } from './grammar';

export interface SpellMark {
  from: number;
  to: number;
}

export interface StoredParagraph {
  hash: string;
  grammar: GrammarIssue[];
  spelling: SpellMark[];
  spellingReady: boolean;
}

export interface StoredChapter {
  hash: string;
  paragraphs: StoredParagraph[];
  chapterGrammar: GrammarIssue[];
  grammarReady: boolean;
}

export interface StoredDoc {
  version: 1;
  lexHash: string;
  settingsKey: string;
  chapters: StoredChapter[];
}

const DB_NAME = 'simple-author';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs');
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function readDocCache(key: string): Promise<StoredDoc | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const value = await requestToPromise(db.transaction('docs').objectStore('docs').get(key));
    if (!value || (value as StoredDoc).version !== 1) return null;
    return value as StoredDoc;
  } catch {
    return null;
  }
}

export async function writeDocCache(key: string, doc: StoredDoc): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('docs', 'readwrite');
    tx.objectStore('docs').put(doc, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function readWordVerdicts(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const db = await openDb();
  if (!db) return map;
  try {
    const keys = (await requestToPromise(db.transaction('words').objectStore('words').getAllKeys())) ?? [];
    const values = (await requestToPromise(db.transaction('words').objectStore('words').getAll())) ?? [];
    for (let i = 0; i < keys.length; i++) {
      map.set(String(keys[i]), values[i] === true || values[i] === 1);
    }
  } catch {
    /* keep the in-memory map */
  }
  return map;
}

export async function writeWordVerdicts(entries: [string, boolean][]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');
    for (const [word, ok] of entries) store.put(ok, word);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function deleteWordVerdict(word: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('words', 'readwrite');
    tx.objectStore('words').delete(word);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

// Reuse a cached block when its text is unchanged, including after an edit
// in some other block. A miss stays put so the next block can still match.
export function matchCachedChapters<T extends { hash: string }>(
  hashes: string[],
  cached: T[] | null,
): (T | null)[] {
  const result: (T | null)[] = [];
  const list = cached ?? [];
  let cursor = 0;
  for (const hash of hashes) {
    if (cursor < list.length && list[cursor].hash === hash) {
      result.push(list[cursor]);
      cursor++;
      continue;
    }
    let found = -1;
    for (let i = cursor; i < list.length; i++) {
      if (list[i].hash === hash) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      result.push(list[found]);
      cursor = found + 1;
    } else {
      result.push(null);
    }
  }
  return result;
}
