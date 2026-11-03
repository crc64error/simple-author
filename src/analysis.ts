// Spell and grammar results are computed once, then kept in the program's
// on-disk cache. Scrolling only paints. A small edit recomputes the paragraph
// that changed and writes that paragraph back to the cache.

import { StateEffect, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  matchCachedChapters,
  readDocCache,
  writeDocCache,
  type SpellMark,
  type StoredChapter,
  type StoredParagraph,
} from './analysis-cache';
import {
  findGrammarIssuesFor,
  grammarSettings,
  setLatestGrammarIssues,
  type GrammarIssue,
  type GrammarSettings,
} from './grammar';
import { findBookBlocks, isLineInBook, readLexicon, type Lexicon } from './lexicon';
import { findNoteBlocks, isLineInNotes } from './notes';
import { lineOpensSentence, wordsInLine } from './prose';
import {
  classifyWord,
  flushSpellingCache,
  initSpellcheck,
  loadSpellingCache,
  spellReady,
  spellScanDict,
} from './spellcheck';
import { initThesaurus, thesaurusReady } from './thesaurus';

export interface AnalysisProgress {
  label: string;
  ratio: number;
}

export interface AnalysisChapter {
  from: number;
  grammar: GrammarIssue[];
  spelling: SpellMark[];
}

export interface AnalysisSnapshot {
  generation: number;
  chapters: AnalysisChapter[];
}

export const analysisEffect = StateEffect.define<AnalysisSnapshot>();

let snapshot: AnalysisSnapshot = { generation: 0, chapters: [] };
let getKey: () => string = () => 'simple-writer-draft';
let onProgress: ((progress: AnalysisProgress | null) => void) | null = null;
let onReady: ((snapshot: AnalysisSnapshot) => void) | null = null;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let forceSpelling = false;
let dictionariesReady: Promise<void> | null = null;

export function analysisSnapshot(): AnalysisSnapshot {
  return snapshot;
}

export function setAnalysisDocumentKey(fn: () => string): void {
  getKey = fn;
}

export function setAnalysisProgress(fn: (progress: AnalysisProgress | null) => void): void {
  onProgress = fn;
}

export function setAnalysisListener(fn: (snapshot: AnalysisSnapshot) => void): void {
  onReady = fn;
}

export function invalidateSpellingReuse(): void {
  forceSpelling = true;
}

export function scheduleAnalysis(view: EditorView): void {
  const token = ++generation;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void runAnalysis(view, token);
  }, 300);
}

export function hashText(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export interface TextSlice {
  from: number;
  to: number;
  text: string;
}

export function chapterSlices(doc: string): TextSlice[] {
  if (!doc) return [];
  const starts = [0];
  for (const match of doc.matchAll(/^#{1,3}\s/gm)) {
    if (match.index > 0) starts.push(match.index);
  }
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : doc.length;
    return { from: start, to: end, text: doc.slice(start, end) };
  });
}

export function paragraphSlices(text: string): TextSlice[] {
  if (!text) return [];
  const slices: TextSlice[] = [];
  const gaps = /\n{2,}/g;
  let start = 0;
  for (const match of text.matchAll(gaps)) {
    if (match.index > start) {
      slices.push({ from: start, to: match.index, text: text.slice(start, match.index) });
    }
    start = match.index + match[0].length;
  }
  if (start < text.length) slices.push({ from: start, to: text.length, text: text.slice(start) });
  return slices;
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function lexHash(lex: Lexicon): string {
  const names = [...lex.names.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`);
  const words = [...lex.words].sort();
  return hashText(`${names.join('\n')}\n--\n${words.join('\n')}`);
}

function settingsKey(settings: GrammarSettings): string {
  return hashText(JSON.stringify([settings.enabled, settings.rules]));
}

function localSettings(settings: GrammarSettings): GrammarSettings {
  return { ...settings, rules: { ...settings.rules, echo: false, 'said-bookism': false } };
}

function chapterOnlySettings(settings: GrammarSettings): GrammarSettings {
  return {
    ...settings,
    rules: {
      repeat: false,
      'adverb-tag': false,
      passive: false,
      filter: false,
      echo: settings.rules.echo !== false,
      'long-sentence': false,
      'dialogue-punct': false,
      'said-bookism': settings.rules['said-bookism'] !== false,
    },
  };
}

async function spellingIn(text: string, lex: Lexicon, token: number): Promise<SpellMark[] | null> {
  if (!spellReady()) return [];
  const noteBlocks = findNoteBlocks(text);
  const bookBlocks = findBookBlocks(text);
  const marks: SpellMark[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let words = 0;
  const dict = spellScanDict();
  for (const line of lines) {
    if (token !== generation) return null;
    if (
      !isLineInNotes(noteBlocks, offset) &&
      !isLineInBook(bookBlocks, offset) &&
      !/^#{1,3}\s/.test(line)
    ) {
      for (const span of wordsInLine(line, lineOpensSentence(text, offset))) {
        const advice = classifyWord(span.word, span.sentenceStart, lex, dict);
        if (advice.kind !== 'ok') marks.push({ from: offset + span.from, to: offset + span.to });
        words++;
        if (words % 250 === 0) await yieldFrame();
      }
    }
    offset += line.length + 1;
  }
  return marks;
}

function projectParagraph(
  slice: TextSlice,
  chapterFrom: number,
  paragraph: StoredParagraph,
  grammar: GrammarIssue[],
  spelling: SpellMark[],
): void {
  for (const issue of paragraph.grammar) {
    grammar.push({
      ...issue,
      from: chapterFrom + slice.from + issue.from,
      to: chapterFrom + slice.from + issue.to,
    });
  }
  for (const mark of paragraph.spelling) {
    spelling.push({
      from: chapterFrom + slice.from + mark.from,
      to: chapterFrom + slice.from + mark.to,
    });
  }
}

async function buildChapter(
  chapter: TextSlice,
  lex: Lexicon,
  settings: GrammarSettings,
  grammarByHash: Map<string, StoredParagraph> | null,
  spellingByHash: Map<string, StoredParagraph> | null,
  token: number,
): Promise<{ record: StoredChapter; grammar: GrammarIssue[]; spelling: SpellMark[] } | null> {
  const slices = paragraphSlices(chapter.text);
  const stored: StoredParagraph[] = [];
  const grammar: GrammarIssue[] = [];
  const spelling: SpellMark[] = [];
  const local = localSettings(settings);

  for (let i = 0; i < slices.length; i++) {
    if (token !== generation) return null;
    const slice = slices[i];
    const hash = hashText(slice.text);
    const grammarHit = grammarByHash?.get(hash) ?? null;
    const spellingHit = spellingByHash?.get(hash) ?? null;
    const keepGrammar = grammarHit !== null;
    const keepSpelling = Boolean(spellingHit && spellingHit.spellingReady && !forceSpelling);
    if (keepGrammar && keepSpelling && grammarHit && spellingHit) {
      const paragraph: StoredParagraph = {
        hash,
        grammar: grammarHit.grammar,
        spelling: spellingHit.spelling,
        spellingReady: true,
      };
      stored.push(paragraph);
      projectParagraph(slice, chapter.from, paragraph, grammar, spelling);
      continue;
    }

    const found =
      keepGrammar && grammarHit
        ? grammarHit.grammar
        : settings.enabled
          ? findGrammarIssuesFor(slice.text, lex, local)
          : [];
    const spell =
      keepSpelling && spellingHit ? spellingHit.spelling : ((await spellingIn(slice.text, lex, token)) ?? []);
    if (token !== generation) return null;
    const paragraph: StoredParagraph = {
      hash,
      grammar: found.map((issue) => ({ ...issue })),
      spelling: spell.map((mark) => ({ ...mark })),
      spellingReady: spellReady(),
    };
    stored.push(paragraph);
    projectParagraph(slice, chapter.from, paragraph, grammar, spelling);
    await yieldFrame();
  }

  let chapterGrammar: GrammarIssue[] = [];
  if (settings.enabled && (settings.rules.echo !== false || settings.rules['said-bookism'] !== false)) {
    chapterGrammar = findGrammarIssuesFor(chapter.text, lex, chapterOnlySettings(settings));
    await yieldFrame();
  }
  if (token !== generation) return null;

  for (const issue of chapterGrammar) {
    grammar.push({ ...issue, from: issue.from + chapter.from, to: issue.to + chapter.from });
  }

  return {
    record: {
      hash: hashText(chapter.text),
      paragraphs: stored,
      chapterGrammar,
      grammarReady: thesaurusReady() && spellReady(),
    },
    grammar,
    spelling,
  };
}

function fromStoredChapter(chapter: TextSlice, cached: StoredChapter): { grammar: GrammarIssue[]; spelling: SpellMark[] } {
  const grammar: GrammarIssue[] = [];
  const spelling: SpellMark[] = [];
  const slices = paragraphSlices(chapter.text);
  const aligned = matchCachedChapters(
    slices.map((slice) => hashText(slice.text)),
    cached.paragraphs,
  );
  for (let i = 0; i < slices.length; i++) {
    const hit = aligned[i];
    if (hit) projectParagraph(slices[i], chapter.from, hit, grammar, spelling);
  }
  for (const issue of cached.chapterGrammar) {
    grammar.push({ ...issue, from: issue.from + chapter.from, to: issue.to + chapter.from });
  }
  return { grammar, spelling };
}

async function ensureDictionaries(
  token: number,
  report: (progress: AnalysisProgress) => void,
): Promise<boolean> {
  if (!dictionariesReady) {
    dictionariesReady = Promise.all([initSpellcheck(), initThesaurus(), loadSpellingCache()]).then(
      () => undefined,
    );
  }
  let waiting = true;
  const flash = setTimeout(() => {
    if (waiting && token === generation) report({ label: 'Loading dictionaries…', ratio: 0 });
  }, 400);
  await dictionariesReady;
  waiting = false;
  clearTimeout(flash);
  return token === generation;
}

async function runAnalysis(view: EditorView, token: number): Promise<void> {
  const key = getKey();
  const report = (progress: AnalysisProgress | null) => {
    if (token === generation) onProgress?.(progress);
  };
  if (!(await ensureDictionaries(token, report))) return;

  const doc = view.state.doc.toString();
  if (token !== generation) return;
  const settings = grammarSettings();
  const lex = readLexicon(doc);
  const lexKey = lexHash(lex);
  const ruleKey = settingsKey(settings);
  const stored = await readDocCache(key);
  if (token !== generation) return;

  const chapters = chapterSlices(doc);
  const lexSame = stored !== null && stored.lexHash === lexKey;
  const rulesSame = stored !== null && stored.settingsKey === ruleKey;
  const grammarByHash = new Map<string, StoredParagraph>();
  const spellingByHash = new Map<string, StoredParagraph>();
  const chapterByHash = new Map<string, StoredChapter>();
  if (stored && lexSame) {
    for (const cached of stored.chapters) {
      if (rulesSame && !forceSpelling && cached.grammarReady) chapterByHash.set(cached.hash, cached);
      for (const paragraph of cached.paragraphs) {
        if (rulesSame && cached.grammarReady) grammarByHash.set(paragraph.hash, paragraph);
        if (paragraph.spellingReady && !forceSpelling) spellingByHash.set(paragraph.hash, paragraph);
      }
    }
  }

  const chapterHashes = chapters.map((chapter) => hashText(chapter.text));
  let stale = 0;
  for (const hash of chapterHashes) if (!chapterByHash.has(hash)) stale++;

  const showProgress = stale > 0 && (stored === null ? doc.length > 2500 : stale > 1 && doc.length > 8000);
  if (showProgress) {
    report({ label: `Checking the manuscript… 0 of ${chapters.length}`, ratio: 0 });
  }

  const nextChapters: StoredChapter[] = [];
  const visible: AnalysisChapter[] = [];
  const absoluteGrammar: GrammarIssue[] = [];
  for (let i = 0; i < chapters.length; i++) {
    if (token !== generation) return;
    const chapter = chapters[i];
    const cachedChapter = chapterByHash.get(chapterHashes[i]);
    if (cachedChapter) {
      nextChapters.push(cachedChapter);
      const projected = fromStoredChapter(chapter, cachedChapter);
      visible.push({ from: chapter.from, grammar: projected.grammar, spelling: projected.spelling });
      absoluteGrammar.push(...projected.grammar);
      continue;
    }

    const built = await buildChapter(chapter, lex, settings, grammarByHash, spellingByHash, token);
    if (!built || token !== generation) return;
    nextChapters.push(built.record);
    visible.push({ from: chapter.from, grammar: built.grammar, spelling: built.spelling });
    absoluteGrammar.push(...built.grammar);
    if (showProgress) {
      const done = i + 1;
      report({
        label: `Checking the manuscript… ${done} of ${chapters.length}`,
        ratio: done / chapters.length,
      });
    }
  }

  if (token !== generation) return;
  if (view.state.doc.toString() !== doc) {
    scheduleAnalysis(view);
    return;
  }

  forceSpelling = false;
  await writeDocCache(key, {
    version: 1,
    lexHash: lexKey,
    settingsKey: ruleKey,
    chapters: nextChapters,
  });
  await flushSpellingCache();
  if (token !== generation) return;

  snapshot = { generation: token, chapters: visible };
  setLatestGrammarIssues(absoluteGrammar);
  onReady?.(snapshot);
  report(null);
  view.dispatch({
    effects: analysisEffect.of(snapshot),
    annotations: Transaction.addToHistory.of(false),
  });
}
