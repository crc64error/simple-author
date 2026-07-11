import { StateEffect, StateField, type Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { findNoteBlocks, isLineInNotes } from './notes';

export const setRenderedModeEffect = StateEffect.define<boolean>();

export const renderedModeField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setRenderedModeEffect)) return effect.value;
    }
    return value;
  },
});

const chapterDeco = Decoration.line({ class: 'cm-chapter-line' });
const sectionDeco = Decoration.line({ class: 'cm-section-line' });
const noteLineDeco = Decoration.line({ class: 'cm-note-line' });
const noteTagDeco = Decoration.line({ class: 'cm-note-line cm-note-tag' });
const emphasisDeco = Decoration.mark({ class: 'cm-emphasis' });
const emphasisMarkerDeco = Decoration.mark({ class: 'cm-emphasis-marker' });
const hiddenMarkupDeco = Decoration.replace({});

class NoteLabelWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-note-label-widget';
    span.textContent = '✎ Note';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const noteOpenDeco = Decoration.replace({ widget: new NoteLabelWidget() });

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const fullText = doc.toString();
  const noteBlocks = findNoteBlocks(fullText);
  const rendered = view.state.field(renderedModeField);
  const cursorLine = doc.lineAt(view.state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    // In rendered mode the markup stays hidden except on the line being
    // edited, so the syntax reappears under the cursor.
    const hideMarkup = rendered && i !== cursorLine;

    if (isLineInNotes(noteBlocks, line.from)) {
      const trimmed = text.trim();
      const isOpenTag = /^\[Notes\]$/i.test(trimmed);
      const isCloseTag = /^\[\/Notes\]$/i.test(trimmed);
      ranges.push((isOpenTag || isCloseTag ? noteTagDeco : noteLineDeco).range(line.from));
      if (hideMarkup && (isOpenTag || isCloseTag) && line.from < line.to) {
        ranges.push((isOpenTag ? noteOpenDeco : hiddenMarkupDeco).range(line.from, line.to));
      }
      continue;
    }

    if (/^# (?!#)/.test(text)) {
      ranges.push(sectionDeco.range(line.from));
      if (hideMarkup) ranges.push(hiddenMarkupDeco.range(line.from, line.from + 2));
      continue;
    }

    if (/^## (?!#)/.test(text)) {
      ranges.push(chapterDeco.range(line.from));
      if (hideMarkup) ranges.push(hiddenMarkupDeco.range(line.from, line.from + 3));
      continue;
    }

    const italicPattern = /\*([^*\n]+)\*|_([^_\n]+)_/g;
    let match: RegExpExecArray | null;
    while ((match = italicPattern.exec(text)) !== null) {
      const fullStart = line.from + match.index;
      const fullEnd = fullStart + match[0].length;
      const contentStart = fullStart + 1;
      const contentEnd = fullEnd - 1;
      const markerDeco = hideMarkup ? hiddenMarkupDeco : emphasisMarkerDeco;

      ranges.push(markerDeco.range(fullStart, fullStart + 1));
      ranges.push(emphasisDeco.range(contentStart, contentEnd));
      ranges.push(markerDeco.range(fullEnd - 1, fullEnd));
    }
  }

  return Decoration.set(ranges, true);
}

export const markdownHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const renderedChanged =
        update.state.field(renderedModeField) !== update.startState.field(renderedModeField);
      const cursorMoved = update.selectionSet && update.state.field(renderedModeField);
      if (update.docChanged || update.viewportChanged || renderedChanged || cursorMoved) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const markdownStyles = EditorView.baseTheme({
  '.cm-section-line': {
    fontSize: '1.55em',
    fontWeight: '600',
    color: 'var(--section)',
    paddingTop: '1.5em',
    paddingBottom: '0.25em',
  },
  '.cm-chapter-line': {
    fontSize: '1.2em',
    fontWeight: '600',
    color: 'var(--chapter)',
    paddingTop: '1em',
    paddingBottom: '0.15em',
  },
  '.cm-note-line': {
    backgroundColor: 'var(--notes-bg)',
    borderLeft: '3px solid var(--notes)',
    paddingLeft: '0.5rem',
    color: 'var(--notes-text)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.9em',
  },
  '.cm-note-tag': {
    fontSize: '0.75em',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--notes)',
    fontStyle: 'italic',
    paddingTop: '0.5em',
    paddingBottom: '0.25em',
  },
  '.cm-note-label-widget': {
    color: 'var(--notes)',
    fontStyle: 'italic',
  },
  '.cm-emphasis': {
    fontStyle: 'italic',
    color: 'var(--emphasis)',
  },
  '.cm-emphasis-marker': {
    color: 'var(--text-muted)',
    fontStyle: 'normal',
    opacity: '0.45',
  },
  '.cm-spell-error': {
    textDecoration: 'underline wavy',
    textDecorationColor: 'var(--spell-error)',
    textUnderlineOffset: '3px',
  },
});
