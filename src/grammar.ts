// Light fiction checks. Each rule is a soft underline the writer can turn off.
// Nothing here rewrites the manuscript — a hint, not a correction.

import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { analysisEffect, analysisSnapshot, scheduleAnalysis } from './analysis';
import { findBookBlocks, readLexicon, type Lexicon } from './lexicon';
import { findNoteBlocks } from './notes';
import { WORD_REGEX_SOURCE, gapEndsSentence } from './prose';
import { findStyleBlocks } from './suno';
import { POS, hasPos, lookupPos, thesaurusReady } from './thesaurus';

export type GrammarRuleId =
  | 'repeat'
  | 'adverb-tag'
  | 'passive'
  | 'filter'
  | 'echo'
  | 'long-sentence'
  | 'dialogue-punct'
  | 'said-bookism';

export interface GrammarRuleInfo {
  id: GrammarRuleId;
  label: string;
  detail: string;
}

export const GRAMMAR_RULES: GrammarRuleInfo[] = [
  { id: 'repeat', label: 'Repeated words', detail: '“the the”' },
  { id: 'adverb-tag', label: '-ly adverbs on dialogue tags', detail: '“said softly”' },
  { id: 'passive', label: 'Passive voice', detail: '“was taken”' },
  { id: 'filter', label: 'Filter words', detail: '“she saw”, “he felt”' },
  { id: 'echo', label: 'Same word in nearby sentences', detail: 'a word echoed within two sentences' },
  { id: 'long-sentence', label: 'Very long sentences', detail: 'more than 40 words' },
  { id: 'dialogue-punct', label: 'Punctuation in dialogue quotes', detail: 'commas and periods belong inside the quotes' },
  { id: 'said-bookism', label: 'Dialogue tags other than “said”', detail: 'the same tag three times in a chapter' },
];

const LONG_SENTENCE_WORDS = 40;
const TAG_REPEAT_LIMIT = 3;
const SETTINGS_KEY = 'simple-writer-grammar';

export interface GrammarSettings {
  enabled: boolean;
  rules: Record<GrammarRuleId, boolean>;
}

function defaultSettings(): GrammarSettings {
  const rules = {} as Record<GrammarRuleId, boolean>;
  for (const rule of GRAMMAR_RULES) rules[rule.id] = true;
  return { enabled: true, rules };
}

function loadSettings(): GrammarSettings {
  const defaults = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<GrammarSettings>;
    return {
      enabled: parsed.enabled !== false,
      rules: { ...defaults.rules, ...parsed.rules },
    };
  } catch {
    return defaults;
  }
}

let settings = loadSettings();

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

export function grammarSettings(): GrammarSettings {
  return {
    enabled: settings.enabled,
    rules: { ...settings.rules },
  };
}

export function ruleEnabled(id: GrammarRuleId): boolean {
  return settings.enabled && settings.rules[id] !== false;
}

export function setGrammarEnabled(on: boolean): void {
  settings = { ...settings, enabled: on };
  saveSettings();
}

export function setGrammarRule(id: GrammarRuleId, on: boolean): void {
  settings = { ...settings, rules: { ...settings.rules, [id]: on } };
  saveSettings();
}

export function ruleLabel(id: GrammarRuleId): string {
  return GRAMMAR_RULES.find((rule) => rule.id === id)?.label ?? id;
}

export interface GrammarIssue {
  from: number;
  to: number;
  rule: GrammarRuleId;
  message: string;
}

const WORD_PATTERN = new RegExp(WORD_REGEX_SOURCE, 'g');

const SPEECH_VERBS = [
  'asked', 'whispered', 'shouted', 'muttered', 'replied', 'answered', 'cried',
  'yelled', 'exclaimed', 'murmured', 'screamed', 'hissed', 'growled', 'sighed',
  'sobbed', 'whimpered', 'pleaded', 'demanded', 'insisted', 'snapped', 'barked',
  'roared', 'gasped', 'stammered', 'mumbled', 'grunted', 'wailed', 'begged',
  'interrupted', 'retorted', 'explained', 'announced', 'declared', 'warned',
  'promised', 'protested', 'shrieked', 'bellowed', 'chuckled', 'laughed',
  'called', 'offered', 'added', 'continued',
];

const TAG_VERBS = ['said', 'say', 'says', ...SPEECH_VERBS];
const TAG_ALT = TAG_VERBS.join('|');
const SPEECH_ALT = SPEECH_VERBS.join('|');

const LY_NOT_MANNER = new Set([
  'only', 'early', 'apply', 'reply', 'supply', 'imply', 'comply', 'multiply',
  'rely', 'family', 'holy', 'ugly', 'silly', 'friendly', 'lonely', 'costly',
  'likely', 'unlikely', 'daily', 'weekly', 'monthly', 'yearly', 'assembly',
]);

const BE = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);

const IRREGULAR_PARTICIPLE = new Set([
  'awoken', 'beaten', 'become', 'begun', 'bent', 'bet', 'bid', 'bitten', 'blown',
  'born', 'broken', 'brought', 'built', 'burned', 'burnt', 'bought', 'caught',
  'chosen', 'come', 'cut', 'dealt', 'done', 'drawn', 'driven', 'drunk', 'dug',
  'eaten', 'fallen', 'fed', 'felt', 'fought', 'found', 'frozen', 'given', 'gone',
  'grown', 'heard', 'held', 'hidden', 'hit', 'hung', 'hurt', 'kept', 'known',
  'laid', 'led', 'left', 'lent', 'let', 'lit', 'lost', 'made', 'meant', 'met',
  'paid', 'put', 'read', 'ridden', 'risen', 'run', 'rung', 'said', 'seen',
  'sent', 'set', 'shaken', 'shown', 'shut', 'sold', 'spoken', 'spent', 'spun',
  'spread', 'stood', 'stolen', 'struck', 'stuck', 'swept', 'sworn', 'taken',
  'taught', 'thought', 'thrown', 'told', 'torn', 'woken', 'worn', 'written',
]);

// Participial adjectives that usually describe a state, not an action.
const STATE_ADJECTIVES = new Set([
  'tired', 'excited', 'interested', 'bored', 'scared', 'worried', 'married',
  'closed', 'locked', 'finished', 'seated', 'gone',
  'supposed', 'used', 'concerned', 'pleased', 'satisfied', 'surprised',
  'amazed', 'confused', 'embarrassed', 'prepared', 'dressed', 'ashamed',
  'determined', 'relieved', 'annoyed', 'frustrated', 'exhausted', 'thrilled',
  'delighted', 'disappointed', 'convinced', 'involved', 'complicated',
  'accustomed', 'depressed', 'dedicated', 'sophisticated',
]);

const FILTER_VERBS = [
  'saw', 'felt', 'heard', 'noticed', 'realized', 'realised', 'wondered',
  'thought', 'knew', 'watched', 'seemed', 'looked', 'decided', 'remembered',
  'believed', 'hoped', 'wished', 'sensed',
];

const ECHO_STOP = new Set([
  'about', 'after', 'again', 'along', 'already', 'almost', 'always', 'another',
  'anything', 'around', 'asked', 'because', 'before', 'being', 'between',
  'called', 'could', 'every', 'everything', 'enough', 'first', 'found', 'going',
  'great', 'having', 'inside', 'little', 'looked', 'might', 'never', 'nothing',
  'other', 'place', 'really', 'right', 'seemed', 'shall', 'should', 'since',
  'small', 'someone', 'something', 'sound', 'started', 'still', 'their',
  'there', 'these', 'thing', 'think', 'those', 'thought', 'three', 'through',
  'toward', 'towards', 'turned', 'under', 'until', 'wanted', 'where', 'which',
  'while', 'without', 'world', 'would', 'years',
]);

interface Span {
  start: number;
  end: number;
}

function hiddenSpans(doc: string): Span[] {
  const spans: Span[] = [
    ...findNoteBlocks(doc).map((block) => ({ start: block.start, end: block.end })),
    ...findBookBlocks(doc).map((block) => ({ start: block.start, end: block.end })),
    ...findStyleBlocks(doc).map((block) => ({ start: block.start, end: block.end })),
  ];
  return spans.sort((a, b) => a.start - b.start);
}

function maskRanges(doc: string, spans: Span[]): string {
  if (spans.length === 0) return doc;
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.end <= cursor) continue;
    const start = Math.max(span.start, cursor);
    out += doc.slice(cursor, start);
    out += doc.slice(start, span.end).replace(/[^\n]/g, ' ');
    cursor = span.end;
  }
  out += doc.slice(cursor);
  return out;
}

function maskPrivate(doc: string): string {
  const masked = maskRanges(doc, hiddenSpans(doc));
  return masked.replace(/^#{1,3}[^\n]*/gm, (line) => ' '.repeat(line.length));
}

function pushIssue(
  issues: GrammarIssue[],
  from: number,
  to: number,
  rule: GrammarRuleId,
  message: string,
): void {
  if (to <= from) return;
  issues.push({ from, to, rule, message });
}

function isLyAdverb(word: string): boolean {
  const lower = word.toLowerCase();
  if (lower.length < 5 || !lower.endsWith('ly')) return false;
  if (LY_NOT_MANNER.has(lower)) return false;
  if (!thesaurusReady()) return true;
  const pos = lookupPos(lower);
  if (pos === 0) return true;
  return (pos & POS.adv) !== 0;
}

function edStems(word: string): string[] {
  const stems = [word.slice(0, -2), word.slice(0, -1)];
  if (word.length > 4 && word[word.length - 3] === word[word.length - 4]) {
    stems.push(word.slice(0, -3));
  }
  if (word.endsWith('ied')) stems.push(`${word.slice(0, -3)}y`);
  return stems;
}

function isPastParticiple(word: string): boolean {
  const lower = word.toLowerCase();
  if (lower.length < 3 || BE.has(lower) || STATE_ADJECTIVES.has(lower)) return false;
  if (IRREGULAR_PARTICIPLE.has(lower)) return true;
  if (!lower.endsWith('ed') || lower.length < 4) return false;
  if (!thesaurusReady()) return true;
  if (edStems(lower).some((stem) => hasPos(stem, POS.verb))) return true;
  return false;
}

function checkRepeats(doc: string, issues: GrammarIssue[]): void {
  const pattern = new RegExp(`\\b(${WORD_REGEX_SOURCE})\\s+\\1\\b`, 'gi');
  for (const match of doc.matchAll(pattern)) {
    pushIssue(
      issues,
      match.index,
      match.index + match[0].length,
      'repeat',
      `“${match[1]}” is repeated.`,
    );
  }
}

function checkAdverbTags(doc: string, issues: GrammarIssue[]): void {
  const after = new RegExp(`\\b(${TAG_ALT})\\s+(${WORD_REGEX_SOURCE})\\b`, 'gi');
  const before = new RegExp(`\\b(${WORD_REGEX_SOURCE})\\s+(${TAG_ALT})\\b`, 'gi');
  for (const match of doc.matchAll(after)) {
    const adverb = match[2];
    if (!isLyAdverb(adverb)) continue;
    const start = match.index + match[0].length - adverb.length;
    pushIssue(issues, start, start + adverb.length, 'adverb-tag', `“${match[1].toLowerCase()} ${adverb.toLowerCase()}” — an -ly adverb on a dialogue tag.`);
  }
  for (const match of doc.matchAll(before)) {
    const adverb = match[1];
    if (!isLyAdverb(adverb)) continue;
    pushIssue(issues, match.index, match.index + adverb.length, 'adverb-tag', `“${adverb.toLowerCase()} ${match[2].toLowerCase()}” — an -ly adverb on a dialogue tag.`);
  }
}

function checkPassive(doc: string, issues: GrammarIssue[]): void {
  const pattern = new RegExp(
    `\\b(am|is|are|was|were|been|be|being)\\s+(?:(?:not|never)\\s+)?(?:${WORD_REGEX_SOURCE}ly\\s+)?(${WORD_REGEX_SOURCE})\\b`,
    'gi',
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(doc))) {
    const participle = match[2];
    // "is being held" — step back so the next be-verb can match.
    if (BE.has(participle.toLowerCase())) {
      pattern.lastIndex = match.index + match[1].length + 1;
      continue;
    }
    if (!isPastParticiple(participle)) continue;
    pushIssue(
      issues,
      match.index,
      match.index + match[0].length,
      'passive',
      `Passive voice (“${match[0].replace(/\s+/g, ' ')}”).`,
    );
  }
}

function checkFilters(doc: string, lex: Lexicon, issues: GrammarIssue[]): void {
  const names = [...lex.names.values()].filter((name) => /^[A-Za-zÀ-ÿ]/.test(name));
  const nameAlt = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const subject = `I|he|she|they|we|it${nameAlt ? `|${nameAlt}` : ''}`;
  const verbs = FILTER_VERBS.join('|');
  const direct = new RegExp(`\\b(?:${subject})\\s+(${verbs})\\b`, 'gi');
  const modal = new RegExp(`\\b(?:${subject})\\s+((?:could|can)\\s+(?:see|hear|feel|taste|smell))\\b`, 'gi');
  for (const pattern of [direct, modal]) {
    for (const match of doc.matchAll(pattern)) {
      const phrase = match[1];
      const start = match.index + match[0].length - phrase.length;
      pushIssue(issues, start, start + phrase.length, 'filter', `Filter word (“${match[0]}”).`);
    }
  }
}

interface Sentence {
  from: number;
  to: number;
}

function splitSentences(doc: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  const boundary = /[.!?]+["”'’)\]]*(?=\s|$)/g;
  for (const match of doc.matchAll(boundary)) {
    const punctAt = match.index;
    const gap = match[0];
    const before = doc.slice(start, punctAt);
    const words = [...before.matchAll(WORD_PATTERN)];
    const last = words[words.length - 1];
    if (last && !gapEndsSentence(gap, last[0])) continue;
    const end = punctAt + gap.length;
    if (end > start) sentences.push({ from: start, to: end });
    start = end;
  }
  if (start < doc.length) sentences.push({ from: start, to: doc.length });
  return sentences.filter((sentence) => sentence.to - sentence.from > 0);
}

function checkEcho(doc: string, lex: Lexicon, issues: GrammarIssue[]): void {
  const sentences = splitSentences(doc);
  const recent: { word: string; index: number }[] = [];
  sentences.forEach((sentence, index) => {
    const oldest = index - 2;
    if (recent.length && recent[0].index < oldest) {
      let drop = 0;
      while (drop < recent.length && recent[drop].index < oldest) drop++;
      recent.splice(0, drop);
    }
    const text = doc.slice(sentence.from, sentence.to);
    const flagged = new Set<string>();
    for (const match of text.matchAll(WORD_PATTERN)) {
      const original = match[0];
      const lower = original.toLowerCase();
      if (lower.length < 5 || ECHO_STOP.has(lower)) continue;
      if (lex.names.has(lower) || lex.words.has(lower)) continue;
      // Capitalized words are usually names. Skipping them keeps the hint off
      // character names, which repeat in every sentence on purpose.
      if (/^[A-ZÀ-Ý]/.test(original) || /[A-ZÀ-Ý]/.test(original.slice(1))) continue;
      const earlier = recent.find((entry) => entry.word === lower && entry.index !== index);
      if (earlier && !flagged.has(lower)) {
        flagged.add(lower);
        const from = sentence.from + match.index;
        pushIssue(issues, from, from + original.length, 'echo', `“${lower}” also appears in a nearby sentence.`);
      }
      if (!flagged.has(`seen:${lower}`)) {
        recent.push({ word: lower, index });
        flagged.add(`seen:${lower}`);
      }
    }
  });
}

function checkLongSentences(doc: string, issues: GrammarIssue[]): void {
  for (const sentence of splitSentences(doc)) {
    const text = doc.slice(sentence.from, sentence.to);
    const words = [...text.matchAll(WORD_PATTERN)];
    if (words.length <= LONG_SENTENCE_WORDS) continue;
    const first = words[0];
    const last = words[words.length - 1];
    pushIssue(
      issues,
      sentence.from + first.index,
      sentence.from + last.index + last[0].length,
      'long-sentence',
      `Long sentence (${words.length} words).`,
    );
  }
}

function isDialogueTag(after: string): boolean {
  const match = after.match(/^([A-Za-zÀ-ÿ'’]+)(?:\s+([A-Za-zÀ-ÿ'’]+))?/);
  if (!match) return false;
  const first = match[1].toLowerCase();
  const second = match[2]?.toLowerCase();
  const verbs = new Set(TAG_VERBS);
  if (verbs.has(first)) return true;
  if (['he', 'she', 'they', 'i', 'we', 'it'].includes(first) && second && verbs.has(second)) return true;
  return false;
}

function checkDialoguePunct(doc: string, issues: GrammarIssue[]): void {
  const outside = /(["“][^"”\n]*)(["”])(\s*)([,.!?])/g;
  for (const match of doc.matchAll(outside)) {
    const punct = match[4];
    const at = match.index + match[0].length - punct.length;
    pushIssue(issues, at, at + punct.length, 'dialogue-punct', 'This punctuation sits outside the quotation marks.');
  }

  const periodBeforeTag = /(["“][^"”\n]*[A-Za-zÀ-ÿ])(\.)(["”]\s+)([a-z].{0,40})/g;
  for (const match of doc.matchAll(periodBeforeTag)) {
    if (!isDialogueTag(match[4])) continue;
    const at = match.index + match[1].length;
    pushIssue(issues, at, at + 1, 'dialogue-punct', 'A dialogue tag takes a comma inside the quotes (“Hello,” she said).');
  }

  const missing = /(["“][^"”\n]*[A-Za-zÀ-ÿ])(["”]\s+)([a-z].{0,40})/g;
  for (const match of doc.matchAll(missing)) {
    if (!isDialogueTag(match[3])) continue;
    const at = match.index + match[1].length;
    pushIssue(issues, at, at + 1, 'dialogue-punct', 'Dialogue that runs into a tag needs a comma inside the quotes.');
  }
}

function chapterSpans(doc: string): Span[] {
  const starts = [0];
  const marker = /^#{1,3}\s/gm;
  for (const match of doc.matchAll(marker)) {
    if (match.index > 0) starts.push(match.index);
  }
  return starts.map((start, i) => ({ start, end: i + 1 < starts.length ? starts[i + 1] : doc.length }));
}

function checkSaidBookism(doc: string, issues: GrammarIssue[]): void {
  const after = new RegExp(`["”]\\s+(?:[A-Za-zÀ-ÿ'’]+\\s+)?(${SPEECH_ALT})\\b`, 'g');
  const before = new RegExp(`\\b(?:[Hh]e|[Ss]he|[Tt]hey|[Ii]|[Ww]e|[A-Z][a-zÀ-ÿ'’]+)\\s+(${SPEECH_ALT})\\b(?=\\s*,?\\s*["“])`, 'g');
  for (const chapter of chapterSpans(doc)) {
    const slice = doc.slice(chapter.start, chapter.end);
    const hits: { verb: string; from: number; to: number }[] = [];
    const seenAt = new Set<number>();
    for (const pattern of [after, before]) {
      for (const match of slice.matchAll(pattern)) {
        const verb = match[1];
        const from = chapter.start + match.index + match[0].length - verb.length;
        if (seenAt.has(from)) continue;
        seenAt.add(from);
        hits.push({ verb: verb.toLowerCase(), from, to: from + verb.length });
      }
    }
    const counts = new Map<string, number>();
    for (const hit of hits) counts.set(hit.verb, (counts.get(hit.verb) ?? 0) + 1);
    const seen = new Map<string, number>();
    const ordered = hits.sort((a, b) => a.from - b.from);
    for (const hit of ordered) {
      const n = (seen.get(hit.verb) ?? 0) + 1;
      seen.set(hit.verb, n);
      const total = counts.get(hit.verb) ?? 0;
      if (total < TAG_REPEAT_LIMIT || n < TAG_REPEAT_LIMIT) continue;
      pushIssue(
        issues,
        hit.from,
        hit.to,
        'said-bookism',
        `“${hit.verb}” appears ${total} times in this chapter. “said” usually carries dialogue more quietly.`,
      );
    }
  }
}

export function findGrammarIssues(doc: string, active: GrammarSettings = grammarSettings()): GrammarIssue[] {
  return findGrammarIssuesFor(doc, readLexicon(doc), active);
}

export function findGrammarIssuesFor(
  doc: string,
  lex: Lexicon,
  active: GrammarSettings = grammarSettings(),
): GrammarIssue[] {
  if (!active.enabled) return [];
  const masked = maskPrivate(doc);
  const issues: GrammarIssue[] = [];
  const on = (id: GrammarRuleId) => active.enabled && active.rules[id] !== false;
  if (on('repeat')) checkRepeats(masked, issues);
  if (on('adverb-tag')) checkAdverbTags(masked, issues);
  if (on('passive')) checkPassive(masked, issues);
  if (on('filter')) checkFilters(masked, lex, issues);
  if (on('echo')) checkEcho(masked, lex, issues);
  if (on('long-sentence')) checkLongSentences(masked, issues);
  if (on('dialogue-punct')) checkDialoguePunct(masked, issues);
  if (on('said-bookism')) checkSaidBookism(masked, issues);
  return issues.sort((a, b) => a.from - b.from || a.to - b.to);
}

let latestIssues: GrammarIssue[] = [];

export function setLatestGrammarIssues(issues: GrammarIssue[]): void {
  latestIssues = issues;
}

export function grammarIssuesAt(pos: number): GrammarIssue[] {
  return latestIssues.filter((issue) => pos >= issue.from && pos <= issue.to);
}

const hintMarks = new Map<string, Decoration>();

function hintMark(message: string): Decoration {
  let mark = hintMarks.get(message);
  if (!mark) {
    mark = Decoration.mark({ class: 'cm-grammar-hint', attributes: { title: message } });
    hintMarks.set(message, mark);
  }
  return mark;
}

export const grammarPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
      scheduleAnalysis(view);
    }

    update(update: ViewUpdate) {
      // Viewport changes must not re-scan. The cached marks are already in
      // the document, and CodeMirror maps them while the writer scrolls.
      if (update.docChanged) scheduleAnalysis(update.view);
      const refresh = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(analysisEffect)),
      );
      if (refresh) this.decorations = this.build(update.view);
    }

    private build(view: EditorView): DecorationSet {
      const max = view.state.doc.length;
      const ranges = [];
      for (const chapter of analysisSnapshot().chapters) {
        for (const issue of chapter.grammar) {
          if (issue.from < issue.to && issue.to <= max) {
            ranges.push(hintMark(issue.message).range(issue.from, issue.to));
          }
        }
      }
      return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
    }
  },
  { decorations: (value) => value.decorations },
);

export function refreshGrammar(view: EditorView): void {
  scheduleAnalysis(view);
}

export function mountGrammarMenu(button: HTMLButtonElement, getView: () => EditorView): void {
  const menu = document.createElement('div');
  menu.className = 'grammar-menu';
  menu.hidden = true;
  document.body.appendChild(menu);

  function syncButton(): void {
    button.setAttribute('aria-pressed', String(settings.enabled));
    button.setAttribute('aria-expanded', String(!menu.hidden));
  }

  function render(): void {
    menu.replaceChildren();
    const title = document.createElement('div');
    title.className = 'grammar-menu-title';
    title.textContent = 'Grammar checks';
    menu.appendChild(title);
    const blurb = document.createElement('p');
    blurb.className = 'grammar-menu-blurb';
    blurb.textContent = 'Soft underlines for fiction drafts. Nothing is rewritten for you.';
    menu.appendChild(blurb);

    const master = document.createElement('label');
    master.className = 'grammar-option grammar-master';
    const masterBox = document.createElement('input');
    masterBox.type = 'checkbox';
    masterBox.checked = settings.enabled;
    masterBox.addEventListener('change', () => {
      setGrammarEnabled(masterBox.checked);
      refreshGrammar(getView());
      render();
      syncButton();
    });
    master.append(masterBox, document.createTextNode('Show grammar checks'));
    menu.appendChild(master);

    for (const rule of GRAMMAR_RULES) {
      const label = document.createElement('label');
      label.className = 'grammar-option';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = settings.rules[rule.id] !== false;
      box.disabled = !settings.enabled;
      box.addEventListener('change', () => {
        setGrammarRule(rule.id, box.checked);
        refreshGrammar(getView());
      });
      const text = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = rule.label;
      const detail = document.createElement('small');
      detail.textContent = rule.detail;
      text.append(name, detail);
      label.append(box, text);
      menu.appendChild(label);
    }
  }

  function place(): void {
    const rect = button.getBoundingClientRect();
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - box.height - 8)}px`;
    syncButton();
  }

  function close(): void {
    menu.hidden = true;
    syncButton();
  }

  button.addEventListener('click', () => {
    if (!menu.hidden) {
      close();
      return;
    }
    render();
    place();
  });

  document.addEventListener('mousedown', (event) => {
    if (menu.hidden) return;
    const target = event.target as Node;
    if (menu.contains(target) || button.contains(target)) return;
    close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  window.addEventListener('resize', close);
  syncButton();
}
