import { StateEffect, type Extension, type Text } from '@codemirror/state';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';
import { findNoteBlocks, isLineInNotes } from './notes';
import { syllablesInLine } from './phonetics';

// Documents are immutable, so identity works as a cache key across the
// per-visible-line gutter callbacks.
let cachedDoc: Text | null = null;
let cachedBlocks: ReturnType<typeof findNoteBlocks> = [];

function noteBlocksFor(doc: Text): ReturnType<typeof findNoteBlocks> {
  if (doc !== cachedDoc) {
    cachedDoc = doc;
    cachedBlocks = findNoteBlocks(doc.toString());
  }
  return cachedBlocks;
}

// Dispatched when the pronunciation dictionary finishes loading, so counts
// computed with the heuristic get corrected.
export const syllablesRefreshEffect = StateEffect.define<void>();

class CountMarker extends GutterMarker {
  constructor(private count: number) {
    super();
  }

  override eq(other: CountMarker): boolean {
    return this.count === other.count;
  }

  override toDOM(): Node {
    const span = document.createElement('span');
    span.className = 'cm-syllable-count';
    span.textContent = String(this.count);
    return span;
  }
}

export function syllableGutter(): Extension {
  return [
    gutter({
      class: 'cm-syllable-gutter',
      lineMarker(view, line) {
        const text = view.state.doc.sliceString(line.from, line.to);
        if (text.trim() === '') return null;
        if (/^#{1,3}\s/.test(text)) return null;
        if (/^\[(?:\/)?Notes\]$/i.test(text.trim())) return null;
        if (isLineInNotes(noteBlocksFor(view.state.doc), line.from)) return null;
        return new CountMarker(syllablesInLine(text));
      },
      lineMarkerChange: (update) =>
        update.transactions.some((tr) => tr.effects.some((e) => e.is(syllablesRefreshEffect))),
    }),
    EditorView.baseTheme({
      '.cm-syllable-gutter': {
        width: '2.2em',
      },
      '.cm-syllable-count': {
        display: 'block',
        textAlign: 'right',
        paddingRight: '0.6em',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.7em',
        lineHeight: 'inherit',
        color: 'var(--text-muted)',
        opacity: '0.7',
      },
    }),
  ];
}
