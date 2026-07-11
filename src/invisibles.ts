import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { isLineInNotes, findNoteBlocks } from './notes';

export const setShowInvisiblesEffect = StateEffect.define<boolean>();

export const showInvisiblesField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setShowInvisiblesEffect)) return effect.value;
    }
    return value;
  },
});

class ParagraphMarkWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-paragraph-mark';
    span.textContent = '¶';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class LineBreakMarkWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-linebreak-mark';
    span.textContent = '↵';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const paragraphMark = Decoration.widget({
  widget: new ParagraphMarkWidget(),
  side: -1,
});

const lineBreakMark = Decoration.widget({
  widget: new LineBreakMarkWidget(),
  side: 1,
});

const STRUCTURAL_LINE = /^#{1,2}\s/;

function buildInvisibles(view: EditorView): DecorationSet {
  if (!view.state.field(showInvisiblesField)) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const noteBlocks = findNoteBlocks(doc.toString());

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    if (text.trim() === '') {
      builder.add(line.from, line.from, paragraphMark);
      continue;
    }

    if (STRUCTURAL_LINE.test(text)) continue;
    if (/^\[(?:\/)?Notes\]$/i.test(text.trim())) continue;
    if (isLineInNotes(noteBlocks, line.from)) continue;

    if (i < doc.lines) {
      const nextLine = doc.line(i + 1);
      if (nextLine.text.trim() !== '') {
        builder.add(line.to, line.to, lineBreakMark);
      }
    }
  }

  return builder.finish();
}

export const invisiblesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildInvisibles(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.state.field(showInvisiblesField) !== update.startState.field(showInvisiblesField)
      ) {
        this.decorations = buildInvisibles(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const invisiblesStyles = EditorView.baseTheme({
  '.cm-paragraph-mark': {
    color: 'var(--invisibles)',
    opacity: '0.5',
    fontSize: '0.85em',
    fontFamily: 'var(--font-ui)',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  '.cm-linebreak-mark': {
    color: 'var(--invisibles)',
    opacity: '0.4',
    fontSize: '0.7em',
    fontFamily: 'var(--font-ui)',
    marginLeft: '0.12em',
    pointerEvents: 'none',
    userSelect: 'none',
    verticalAlign: 'middle',
  },
});