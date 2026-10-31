// Find / replace. Replace All is one editor transaction, so it is one undo step.
// Navigation only moves the selection and is kept out of the undo history.

import { redo, undo } from '@codemirror/commands';
import { StateEffect, Transaction, type ChangeSpec } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, type KeyBinding } from '@codemirror/view';

export interface FindQuery {
  search: string;
  replace: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface TextMatch {
  from: number;
  to: number;
}

const EMPTY_QUERY: FindQuery = { search: '', replace: '', caseSensitive: false, wholeWord: false };

let query: FindQuery = { ...EMPTY_QUERY };
let barOpen = false;
let opener: ((view: EditorView) => void) | null = null;

const refreshEffect = StateEffect.define<void>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findMatches(text: string, spec: FindQuery): TextMatch[] {
  if (!spec.search) return [];
  const flags = spec.caseSensitive ? 'gu' : 'giu';
  let source = escapeRegExp(spec.search);
  if (spec.wholeWord) {
    source = `(?<![\\p{L}\\p{N}_'’])(?:${source})(?![\\p{L}\\p{N}_'’])`;
  }
  let pattern: RegExp;
  try {
    pattern = new RegExp(source, flags);
  } catch {
    return [];
  }
  const matches: TextMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[0].length === 0 || match.index === undefined) continue;
    matches.push({ from: match.index, to: match.index + match[0].length });
    if (matches.length >= 20000) break;
  }
  return matches;
}

export function replaceAllChanges(matches: TextMatch[], replacement: string): ChangeSpec[] {
  return matches.map((match) => ({ from: match.from, to: match.to, insert: replacement }));
}

const matchMark = Decoration.mark({ class: 'cm-find-match' });
const currentMark = Decoration.mark({ class: 'cm-find-match cm-find-match-current' });

function overlaps(view: EditorView, from: number, to: number): boolean {
  return view.visibleRanges.some((range) => to >= range.from && from <= range.to);
}

export const findHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      const refresh = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(refreshEffect)),
      );
      if (refresh || update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      if (!barOpen || !query.search) return Decoration.none;
      const sel = view.state.selection.main;
      const ranges = [];
      for (const match of findMatches(view.state.doc.toString(), query)) {
        if (!overlaps(view, match.from, match.to)) continue;
        const current = match.from === sel.from && match.to === sel.to;
        ranges.push((current ? currentMark : matchMark).range(match.from, match.to));
      }
      return ranges.length ? Decoration.set(ranges) : Decoration.none;
    }
  },
  { decorations: (value) => value.decorations },
);

export const findBindings: KeyBinding[] = [
  {
    key: 'Mod-f',
    preventDefault: true,
    stopPropagation: true,
    run(view) {
      opener?.(view);
      return true;
    },
  },
];

function currentMatchIndex(matches: TextMatch[], from: number, to: number): number {
  return matches.findIndex((match) => match.from === from && match.to === to);
}

function indexFrom(matches: TextMatch[], pos: number, direction: 1 | -1): number {
  if (matches.length === 0) return -1;
  if (direction > 0) {
    const found = matches.findIndex((match) => match.from >= pos);
    return found === -1 ? 0 : found;
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].from < pos) return i;
  }
  return matches.length - 1;
}

export function setupFindBar(view: EditorView, host: HTMLElement): { open: () => void } {
  const bar = document.createElement('div');
  bar.className = 'find-bar';
  bar.hidden = true;

  const findRow = document.createElement('div');
  findRow.className = 'find-row';
  const replaceRow = document.createElement('div');
  replaceRow.className = 'find-row';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'find-input';
  searchInput.placeholder = 'Find';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.setAttribute('aria-label', 'Find');

  const replaceInput = document.createElement('input');
  replaceInput.type = 'text';
  replaceInput.className = 'find-input';
  replaceInput.placeholder = 'Replace';
  replaceInput.autocomplete = 'off';
  replaceInput.spellcheck = false;
  replaceInput.setAttribute('aria-label', 'Replace');

  const caseBtn = toggleButton('Aa', 'Match case');
  const wordBtn = toggleButton('Word', 'Whole word');
  const prevBtn = actionButton('Previous', 'Previous match (Shift+Enter)');
  const nextBtn = actionButton('Next', 'Next match (Enter)');
  const count = document.createElement('span');
  count.className = 'find-count';
  const closeBtn = actionButton('×', 'Close');
  closeBtn.classList.add('find-close');
  const replaceBtn = actionButton('Replace', 'Replace the current match');
  const allBtn = actionButton('Replace all', 'Replace every match in one undo step');

  findRow.append(searchInput, caseBtn, wordBtn, prevBtn, nextBtn, count, closeBtn);
  replaceRow.append(replaceInput, replaceBtn, allBtn);
  bar.append(findRow, replaceRow);
  host.insertBefore(bar, host.querySelector('#editor'));

  function readQuery(): FindQuery {
    return {
      search: searchInput.value,
      replace: replaceInput.value,
      caseSensitive: caseBtn.getAttribute('aria-pressed') === 'true',
      wholeWord: wordBtn.getAttribute('aria-pressed') === 'true',
    };
  }

  function publish() {
    query = readQuery();
    view.dispatch({
      effects: refreshEffect.of(),
      annotations: Transaction.addToHistory.of(false),
    });
    updateCount();
  }

  function matches(): TextMatch[] {
    return findMatches(view.state.doc.toString(), readQuery());
  }

  function updateCount() {
    const found = matches();
    const sel = view.state.selection.main;
    const index = currentMatchIndex(found, sel.from, sel.to);
    count.textContent = !readQuery().search
      ? ''
      : found.length === 0
        ? 'No matches'
        : index >= 0
          ? `${index + 1} of ${found.length}`
          : `${found.length} match${found.length === 1 ? '' : 'es'}`;
    const enabled = found.length > 0;
    replaceBtn.disabled = !enabled;
    allBtn.disabled = !enabled;
    prevBtn.disabled = !enabled;
    nextBtn.disabled = !enabled;
  }

  function selectMatch(index: number) {
    const found = matches();
    if (found.length === 0 || index < 0) {
      updateCount();
      return;
    }
    const match = found[(index + found.length) % found.length];
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      scrollIntoView: true,
      userEvent: 'select',
      annotations: Transaction.addToHistory.of(false),
      effects: refreshEffect.of(),
    });
    updateCount();
  }

  function step(direction: 1 | -1) {
    const found = matches();
    const sel = view.state.selection.main;
    const current = currentMatchIndex(found, sel.from, sel.to);
    if (current >= 0) {
      selectMatch(current + direction);
      return;
    }
    selectMatch(indexFrom(found, direction > 0 ? sel.from : sel.to, direction));
  }

  function replaceOne() {
    const spec = readQuery();
    const found = findMatches(view.state.doc.toString(), spec);
    if (found.length === 0) return;
    const sel = view.state.selection.main;
    let index = currentMatchIndex(found, sel.from, sel.to);
    if (index < 0) index = indexFrom(found, sel.from, 1);
    const match = found[index];
    view.dispatch({
      changes: { from: match.from, to: match.to, insert: spec.replace },
      selection: { anchor: match.from + spec.replace.length },
      userEvent: 'input.replace',
    });
    step(1);
  }

  function replaceAll() {
    const spec = readQuery();
    const found = findMatches(view.state.doc.toString(), spec);
    if (found.length === 0) return;
    // One transaction: history records it as a single undo step, and the
    // userEvent keeps it from merging with nearby typing.
    view.dispatch({
      changes: replaceAllChanges(found, spec.replace),
      userEvent: 'input.replace.all',
    });
    updateCount();
  }

  function open() {
    const wasClosed = bar.hidden;
    if (wasClosed) {
      const selected = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
      if (selected && !selected.includes('\n') && selected.length <= 80) {
        searchInput.value = selected;
      }
    }
    bar.hidden = false;
    barOpen = true;
    publish();
    searchInput.focus();
    searchInput.select();
    if (wasClosed && searchInput.value) {
      const found = matches();
      const sel = view.state.selection.main;
      const current = currentMatchIndex(found, sel.from, sel.to);
      if (current >= 0) selectMatch(current);
      else step(1);
    }
  }

  function close() {
    bar.hidden = true;
    barOpen = false;
    query = { ...EMPTY_QUERY };
    view.dispatch({
      effects: refreshEffect.of(),
      annotations: Transaction.addToHistory.of(false),
    });
    view.focus();
  }

  searchInput.addEventListener('input', () => {
    publish();
    const found = matches();
    if (found.length === 0) return;
    selectMatch(indexFrom(found, view.state.selection.main.from, 1));
  });
  replaceInput.addEventListener('input', publish);
  caseBtn.addEventListener('click', () => {
    togglePressed(caseBtn);
    publish();
  });
  wordBtn.addEventListener('click', () => {
    togglePressed(wordBtn);
    publish();
  });
  nextBtn.addEventListener('click', () => step(1));
  prevBtn.addEventListener('click', () => step(-1));
  replaceBtn.addEventListener('click', replaceOne);
  allBtn.addEventListener('click', replaceAll);
  closeBtn.addEventListener('click', close);

  function onFindKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.target === replaceInput && !event.shiftKey) replaceOne();
      else step(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
  searchInput.addEventListener('keydown', onFindKey);
  replaceInput.addEventListener('keydown', onFindKey);

  // While the fields are focused, the browser would undo the input text.
  // Undo should undo the manuscript, including a Replace All.
  bar.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(view);
      else undo(view);
      updateCount();
    } else if (key === 'y') {
      event.preventDefault();
      redo(view);
      updateCount();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'f') return;
    if (document.body.classList.contains('modal-open')) return;
    event.preventDefault();
    open();
  });

  opener = () => open();

  return { open };
}

function toggleButton(label: string, title: string): HTMLButtonElement {
  const button = actionButton(label, title);
  button.classList.add('find-toggle');
  button.setAttribute('aria-pressed', 'false');
  return button;
}

function togglePressed(button: HTMLButtonElement): void {
  button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
}

function actionButton(label: string, title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'find-btn';
  button.textContent = label;
  button.title = title;
  return button;
}
