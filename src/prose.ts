// Shared word and sentence scanning for spellcheck and grammar.
// Apostrophes: Hunspell's ICONV maps ’ to ', but the scanner has to treat
// curly and straight apostrophes as the same character or "don't" splits.

export const WORD_REGEX_SOURCE = "[a-zA-ZÀ-ÿ]+(?:['’‘][a-zA-ZÀ-ÿ]+)*";
const WORD_PATTERN = new RegExp(WORD_REGEX_SOURCE, 'g');

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'fig', 'vol',
  'no', 'pp', 'gen', 'rev', 'hon', 'capt', 'sgt', 'lt', 'col', 'ave', 'blvd',
  'rd', 'inc', 'ltd', 'co', 'approx', 'dept', 'est', 'gov', 'sen', 'rep',
]);

export interface WordSpan {
  word: string;
  from: number;
  to: number;
  sentenceStart: boolean;
}

export function straightenApostrophes(word: string): string {
  return word.replace(/[’‘]/g, "'");
}

export function wordIsAbbreviation(word: string): boolean {
  return ABBREVIATIONS.has(straightenApostrophes(word).toLowerCase().replace(/\.$/, ''));
}

// True when `gap` (the text between the previous word and this one, or after
// the last word of a line) ends a sentence. Ellipses and abbreviations don't.
export function gapEndsSentence(gap: string, prevWord: string): boolean {
  if (/\.\.\.\s*$/.test(gap) || /…\s*$/.test(gap)) return false;
  if (!/[.!?]["”'’)\]]*\s*$/.test(gap)) return false;
  if (/[!?]/.test(gap)) return true;
  if (prevWord.length === 1) return false;
  if (wordIsAbbreviation(prevWord)) return false;
  return true;
}

export function lineEndsSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^#{1,3}\s/.test(trimmed)) return true;
  if (/^\[\/?(?:Notes|Book|Style)\]$/i.test(trimmed)) return true;
  const matches = [...trimmed.matchAll(WORD_PATTERN)];
  if (matches.length === 0) return /[.!?]/.test(trimmed);
  const last = matches[matches.length - 1];
  const gap = trimmed.slice(last.index + last[0].length);
  return gapEndsSentence(gap, last[0]);
}

// An opening quote sitting against the next word starts dialogue, which
// capitalizes like a sentence. A closing quote has the dialogue's own
// punctuation immediately before it: ,"  ."  !"
function opensDialogue(gap: string): boolean {
  const idx = Math.max(gap.lastIndexOf('"'), gap.lastIndexOf('“'));
  if (idx === -1) return false;
  if (!/^\s*$/.test(gap.slice(idx + 1))) return false;
  if (idx > 0 && /[,.!?…]/.test(gap[idx - 1])) return false;
  return true;
}

function onlyLeadIn(gap: string): boolean {
  return /^[\s#>*_("'“(\[]*$/.test(gap);
}

export function wordsInLine(lineText: string, sentenceOpen: boolean): WordSpan[] {
  const spans: WordSpan[] = [];
  let prev: WordSpan | null = null;
  for (const match of lineText.matchAll(WORD_PATTERN)) {
    const gap = lineText.slice(prev ? prev.to : 0, match.index);
    let sentenceStart = false;
    if (!prev) {
      sentenceStart = (sentenceOpen && onlyLeadIn(gap)) || opensDialogue(gap) || gapEndsSentence(gap, '');
    } else {
      sentenceStart = gapEndsSentence(gap, prev.word) || opensDialogue(gap);
    }
    const span: WordSpan = {
      word: match[0],
      from: match.index,
      to: match.index + match[0].length,
      sentenceStart,
    };
    spans.push(span);
    prev = span;
  }
  return spans;
}

// Whether the line that begins at `lineStart` opens a sentence.
export function lineOpensSentence(doc: string, lineStart: number): boolean {
  if (lineStart <= 0) return true;
  const prevEnd = lineStart - 1;
  const prevStart = doc.lastIndexOf('\n', prevEnd - 1) + 1;
  const prevText = doc.slice(prevStart, prevEnd);
  if (prevText.trim() === '') return true;
  return lineEndsSentence(prevText);
}

export function isSentenceStart(doc: string, wordFrom: number): boolean {
  const lineStart = doc.lastIndexOf('\n', wordFrom - 1) + 1;
  const lineEndIdx = doc.indexOf('\n', wordFrom);
  const line = doc.slice(lineStart, lineEndIdx === -1 ? doc.length : lineEndIdx);
  const rel = wordFrom - lineStart;
  const spans = wordsInLine(line, lineOpensSentence(doc, lineStart));
  return spans.some((span) => span.from === rel && span.sentenceStart);
}
