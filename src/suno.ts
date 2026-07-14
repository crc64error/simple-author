// Suno support for Lyrics mode: a [Style]…[/Style] prompt block with a live
// character budget, [performance tag] styling, and paste-ready exports.

import { StateEffect, StateField, type Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { findNoteBlocks, isLineInNotes, stripNotes } from './notes';

export const STYLE_OPEN = '[Style]';
export const STYLE_CLOSE = '[/Style]';
export const SUNO_STYLE_LIMIT = 1000;

const OPEN_PATTERN = /^\[Style\]$/i;
const CLOSE_PATTERN = /^\[\/Style\]$/i;

export interface StyleBlock {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
}

export function findStyleBlocks(doc: string): StyleBlock[] {
  const lines = doc.split('\n');
  const blocks: StyleBlock[] = [];
  let offset = 0;
  let blockStart = -1;
  let contentStart = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (OPEN_PATTERN.test(trimmed)) {
      blockStart = offset;
      contentStart = offset + line.length + 1;
    } else if (CLOSE_PATTERN.test(trimmed) && blockStart >= 0) {
      blocks.push({
        start: blockStart,
        end: offset + line.length + 1,
        contentStart,
        contentEnd: Math.max(contentStart, offset - 1),
      });
      blockStart = -1;
    }
    offset += line.length + 1;
  }

  return blocks;
}

export function getStylePrompt(doc: string): string | null {
  const blocks = findStyleBlocks(doc);
  if (blocks.length === 0) return null;
  const prompt = blocks
    .map((b) => doc.slice(b.contentStart, b.contentEnd).trim())
    .filter((t) => t !== '')
    .join('\n');
  return prompt || null;
}

export function styleCharCount(doc: string): { count: number; over: boolean } | null {
  const prompt = getStylePrompt(doc);
  if (prompt === null) {
    return findStyleBlocks(doc).length > 0 ? { count: 0, over: false } : null;
  }
  return { count: prompt.length, over: prompt.length > SUNO_STYLE_LIMIT };
}

export function stripStyleBlocks(doc: string): string {
  const blocks = findStyleBlocks(doc);
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

// Lyrics ready for Suno's lyrics box: style block, notes, and song titles
// removed; `## Verse 1` headings become Suno's [Verse 1] tags.
export function buildSunoLyrics(doc: string): string {
  return stripNotes(stripStyleBlocks(doc))
    .replace(/^# (?!#).*$/gm, '')
    .replace(/^## (?!#)(.+?)\s*$/gm, '[$1]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// A line that is only a [bracket tag] — a performance direction like
// [Building vocals, female lead] — but not our block delimiters.
export function isPerformanceTagLine(trimmed: string): boolean {
  if (!/^\[[^\][]+\]$/.test(trimmed)) return false;
  return !/^\[\/?(?:Notes|Style)\]$/i.test(trimmed);
}

// --- Editor integration ---

export const setLyricsModeEffect = StateEffect.define<boolean>();

export const lyricsModeField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLyricsModeEffect)) return effect.value;
    }
    return value;
  },
});

class CharBudgetWidget extends WidgetType {
  constructor(
    private count: number,
    private over: boolean,
  ) {
    super();
  }

  override eq(other: CharBudgetWidget): boolean {
    return this.count === other.count && this.over === other.over;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `cm-suno-budget${this.over ? ' cm-suno-budget-over' : ''}`;
    span.textContent = ` ${this.count} / ${SUNO_STYLE_LIMIT}`;
    span.title = this.over
      ? `Suno style prompts are limited to ${SUNO_STYLE_LIMIT} characters`
      : 'Suno style prompt budget';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

const styleLineDeco = Decoration.line({ class: 'cm-style-line' });
const styleTagDeco = Decoration.line({ class: 'cm-style-line cm-style-tag' });
const sunoTagDeco = Decoration.line({ class: 'cm-suno-tag' });

function buildDecorations(view: EditorView): DecorationSet {
  if (!view.state.field(lyricsModeField)) return Decoration.none;

  const ranges: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const text = doc.toString();
  const styleBlocks = findStyleBlocks(text);
  const noteBlocks = findNoteBlocks(text);
  const budget = styleCharCount(text);

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const trimmed = line.text.trim();
    const inStyle = styleBlocks.some((b) => line.from >= b.start && line.from < b.end);

    if (inStyle) {
      const isOpen = OPEN_PATTERN.test(trimmed);
      const isClose = CLOSE_PATTERN.test(trimmed);
      ranges.push((isOpen || isClose ? styleTagDeco : styleLineDeco).range(line.from));
      if (isOpen && budget) {
        ranges.push(
          Decoration.widget({ widget: new CharBudgetWidget(budget.count, budget.over), side: 1 }).range(line.to),
        );
      }
      continue;
    }

    if (isPerformanceTagLine(trimmed) && !isLineInNotes(noteBlocks, line.from)) {
      ranges.push(sunoTagDeco.range(line.from));
    }
  }

  return Decoration.set(ranges, true);
}

export const sunoPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const modeChanged =
        update.state.field(lyricsModeField) !== update.startState.field(lyricsModeField);
      if (update.docChanged || update.viewportChanged || modeChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const sunoStyles = EditorView.baseTheme({
  '.cm-style-line': {
    backgroundColor: 'var(--reminders-bg)',
    borderLeft: '3px solid var(--reminders)',
    paddingLeft: '0.5rem',
    color: 'var(--reminders-text)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.9em',
  },
  '.cm-style-tag': {
    fontSize: '0.75em',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--reminders)',
    fontStyle: 'italic',
    paddingTop: '0.5em',
    paddingBottom: '0.25em',
  },
  '.cm-suno-budget': {
    fontFamily: 'var(--font-ui)',
    fontSize: '0.85em',
    fontStyle: 'normal',
    fontWeight: '500',
    letterSpacing: '0',
    textTransform: 'none',
    color: 'var(--text-muted)',
    marginLeft: '0.75em',
  },
  '.cm-suno-budget-over': {
    color: 'var(--spell-error)',
    fontWeight: '700',
  },
  '.cm-suno-tag': {
    color: 'var(--accent)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.85em',
    fontStyle: 'italic',
    letterSpacing: '0.02em',
  },
});
