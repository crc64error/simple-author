import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { invisiblesPlugin, invisiblesStyles, setShowInvisiblesEffect, showInvisiblesField } from './invisibles';
import { markdownHighlight, markdownStyles, renderedModeField, setRenderedModeEffect } from './markdown';
import { spellcheckPlugin } from './spellcheck';
import { scriptureModeField, scripturePlugin, scriptureStyles, setScriptureModeEffect } from './scripture';
import { editorTheme } from './themes';
import { NOTE_CLOSE, NOTE_OPEN } from './notes';
import { BLANK_DOCUMENTS } from './modes';
import { computeWordCounts, type WordCountSnapshot } from './wordcount';

export interface EditorSnapshot {
  doc: string;
  cursorPos: number;
  counts: WordCountSnapshot;
}

const WELCOME = `# Section 1 — Welcome

## Chapter One

Welcome to Simple Author. Sections (\`#\`) and chapters (\`##\`) build the outline on the left, and the word counts below track wherever your cursor is.

*Italics are set off in their own color — handy for inner voices, emphasis, or letters.*

[Notes]
Author notes live in blocks like this one. They stay visible while you write, and are stripped from every export.
[/Notes]

Open your manuscript, or select all and start typing. The story begins here.
`;

export interface WriterEditor {
  view: EditorView;
  getContent: () => string;
  setContent: (text: string) => void;
  wrapSelection: (before: string, after: string) => void;
  insertLinePrefix: (prefix: string) => void;
  scrollTo: (pos: number) => void;
  wrapInNotes: () => void;
  insertBlock: (text: string, placement: 'top' | 'cursor' | 'end') => void;
  setShowNotes: (show: boolean) => void;
  setShowInvisibles: (show: boolean) => void;
  setRenderedMode: (on: boolean) => void;
  setScriptureHighlight: (on: boolean) => void;
  newDocument: (blank: string) => void;
  isEmpty: () => boolean;
}

function emitSnapshot(view: EditorView, onUpdate: (snapshot: EditorSnapshot) => void): void {
  const doc = view.state.doc.toString();
  const cursorPos = view.state.selection.main.head;
  onUpdate({ doc, cursorPos, counts: computeWordCounts(doc, cursorPos) });
}

export function createEditor(
  parent: HTMLElement,
  editorContainer: HTMLElement,
  onUpdate: (snapshot: EditorSnapshot) => void,
): WriterEditor {
  const state = EditorState.create({
    doc: loadDraft() ?? WELCOME,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      editorTheme(),
      markdownStyles,
      invisiblesStyles,
      renderedModeField,
      markdownHighlight,
      showInvisiblesField,
      invisiblesPlugin,
      scriptureModeField,
      scripturePlugin,
      scriptureStyles,
      spellcheckPlugin,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          localStorage.setItem('simple-writer-draft', update.state.doc.toString());
        }
        if (update.docChanged || update.selectionSet) {
          emitSnapshot(update.view, onUpdate);
        }
      }),
    ],
  });

  const view = new EditorView({ state, parent });

  // Line heights are measured with the fallback font until Crimson Pro
  // arrives; without a re-measure, clicks resolve against stale geometry.
  void document.fonts?.ready.then(() => view.requestMeasure());

  emitSnapshot(view, onUpdate);

  return {
    view,
    getContent: () => view.state.doc.toString(),
    setContent: (text: string) => {
      // Pin the cursor to the start of the newly opened document. Leaving it
      // to selection mapping can strand the caret off-screen, and WebKit
      // scrolls to an off-screen caret when the first click focuses the
      // editor — turning that click into a drag selection.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0 },
        effects: EditorView.scrollIntoView(0),
      });
    },
    wrapSelection: (before: string, after: string) => {
      const { from, to } = view.state.selection.main;
      const selected = view.state.doc.sliceString(from, to);
      view.dispatch({
        changes: { from, to, insert: `${before}${selected}${after}` },
        selection: { anchor: from + before.length, head: from + before.length + selected.length },
      });
      view.focus();
    },
    insertLinePrefix: (prefix: string) => {
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const lineText = line.text;

      if (lineText.startsWith(prefix)) {
        view.dispatch({
          changes: { from: line.from, to: line.from + prefix.length, insert: '' },
        });
      } else {
        const existing = lineText.match(/^#{1,3}\s/);
        if (existing) {
          view.dispatch({
            changes: { from: line.from, to: line.from + existing[0].length, insert: prefix },
          });
        } else {
          view.dispatch({
            changes: { from: line.from, insert: prefix },
          });
        }
      }
      view.focus();
    },
    scrollTo: (pos: number) => {
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 80 }),
      });
      view.focus();
    },
    wrapInNotes: () => {
      const { from, to } = view.state.selection.main;
      const doc = view.state.doc;
      const selected = doc.sliceString(from, to);
      // [Notes] and [/Notes] are only recognized alone on their own lines,
      // so pad with newlines when the insertion point touches other text.
      const prefix = from === 0 || doc.sliceString(from - 1, from) === '\n' ? '' : '\n';
      const suffix = to === doc.length || doc.sliceString(to, to + 1) === '\n' ? '' : '\n';
      if (selected.trim()) {
        view.dispatch({
          changes: { from, to, insert: `${prefix}${NOTE_OPEN}\n${selected}\n${NOTE_CLOSE}${suffix}` },
        });
      } else {
        const block = `${prefix}${NOTE_OPEN}\n\n${NOTE_CLOSE}${suffix}`;
        view.dispatch({
          changes: { from, to, insert: block },
          selection: { anchor: from + prefix.length + NOTE_OPEN.length + 1 },
        });
      }
      view.focus();
    },
    insertBlock: (text: string, placement: 'top' | 'cursor' | 'end') => {
      const doc = view.state.doc;
      let pos: number;
      if (placement === 'top') pos = 0;
      else if (placement === 'end') pos = doc.length;
      else pos = doc.lineAt(view.state.selection.main.head).from;

      // Keep the block separated from surrounding text by blank lines.
      let prefix = '';
      if (pos > 0) {
        const before = doc.sliceString(Math.max(0, pos - 2), pos);
        if (!before.endsWith('\n')) prefix = '\n\n';
        else if (before !== '\n\n') prefix = '\n';
      }
      const suffix = pos === doc.length ? '\n' : '\n\n';

      const block = text.trim();
      view.dispatch({
        changes: { from: pos, insert: `${prefix}${block}${suffix}` },
        selection: { anchor: pos + prefix.length },
        effects: EditorView.scrollIntoView(pos + prefix.length, { y: 'start', yMargin: 80 }),
      });
      view.focus();
    },
    setShowNotes: (show: boolean) => {
      editorContainer.classList.toggle('notes-hidden', !show);
      view.dom.classList.toggle('notes-hidden', !show);
    },
    setShowInvisibles: (show: boolean) => {
      view.dispatch({ effects: setShowInvisiblesEffect.of(show) });
    },
    setRenderedMode: (on: boolean) => {
      view.dispatch({ effects: setRenderedModeEffect.of(on) });
      editorContainer.classList.toggle('rendered-mode', on);
    },
    setScriptureHighlight: (on: boolean) => {
      view.dispatch({ effects: setScriptureModeEffect.of(on) });
    },
    newDocument: (blank: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: blank },
        selection: { anchor: blank.length },
      });
      localStorage.setItem('simple-writer-draft', blank);
      view.focus();
    },
    isEmpty: () => {
      const text = view.state.doc.toString().trim();
      return text === '' || BLANK_DOCUMENTS.some((blank) => text === blank.trim());
    },
  };
}

function loadDraft(): string | null {
  try {
    return localStorage.getItem('simple-writer-draft');
  } catch {
    return null;
  }
}