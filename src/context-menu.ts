import { EditorView } from '@codemirror/view';
import {
  addToUserDictionary,
  isInUserDictionary,
  isMisspelled,
  refreshSpellcheck,
  removeFromUserDictionary,
  spellSuggestions,
  WORD_REGEX_SOURCE,
} from './spellcheck';
import { lookupSynonyms } from './thesaurus';
import { lookupRhymes } from './phonetics';

export interface ContextMenuOptions {
  showRhymes: () => boolean;
}

interface WordHit {
  from: number;
  to: number;
  text: string;
}

export function setupContextMenu(view: EditorView, options: ContextMenuOptions): void {
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.hidden = true;
  document.body.appendChild(menu);

  // Invalidates in-flight synonym lookups once the menu closes or reopens.
  let openToken = 0;
  let anchorX = 0;
  let anchorY = 0;

  function close(): void {
    openToken++;
    menu.hidden = true;
  }

  function place(x: number, y: number): void {
    anchorX = x;
    anchorY = y;
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  }

  function addLabel(parent: HTMLElement, text: string): HTMLElement {
    const label = document.createElement('div');
    label.className = 'ctx-label';
    label.textContent = text;
    parent.appendChild(label);
    return label;
  }

  function addItem(parent: HTMLElement, text: string, action: () => void): void {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ctx-item';
    item.textContent = text;
    item.addEventListener('click', () => {
      close();
      action();
    });
    parent.appendChild(item);
  }

  function addSeparator(parent: HTMLElement): void {
    const sep = document.createElement('div');
    sep.className = 'ctx-sep';
    parent.appendChild(sep);
  }

  function wordAt(pos: number): WordHit | null {
    const line = view.state.doc.lineAt(pos);
    const offset = pos - line.from;
    const pattern = new RegExp(WORD_REGEX_SOURCE, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line.text)) !== null) {
      if (match.index <= offset && offset <= match.index + match[0].length) {
        return {
          from: line.from + match.index,
          to: line.from + match.index + match[0].length,
          text: match[0],
        };
      }
      if (match.index > offset) break;
    }
    return null;
  }

  function replaceRange(hit: WordHit, replacement: string): void {
    view.dispatch({
      changes: { from: hit.from, to: hit.to, insert: replacement },
      selection: { anchor: hit.from + replacement.length },
    });
    view.focus();
  }

  // Carry the original word's casing over to a lowercase thesaurus entry.
  function matchCase(original: string, replacement: string): string {
    if (original === original.toUpperCase() && original.length > 1) {
      return replacement.toUpperCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function buildSynonymSection(hit: WordHit): void {
    const section = document.createElement('div');
    menu.appendChild(section);
    const pending = addLabel(section, 'Synonyms — looking up…');

    const token = openToken;
    void lookupSynonyms(hit.text).then((result) => {
      if (token !== openToken) return;
      pending.remove();
      if (!result) {
        addLabel(section, 'No synonyms found');
        return;
      }
      const differs = result.headword !== hit.text.toLowerCase();
      for (const group of result.groups) {
        const heading = differs
          ? `Synonyms for “${result.headword}” — ${group.pos}`
          : `Synonyms — ${group.pos}`;
        addLabel(section, heading);
        for (const word of group.words) {
          addItem(section, word, () => replaceRange(hit, matchCase(hit.text, word)));
        }
      }
      place(anchorX, anchorY);
    });
  }

  function buildRhymeSection(hit: WordHit): void {
    const section = document.createElement('div');
    menu.appendChild(section);
    const pending = addLabel(section, 'Rhymes — looking up…');

    const token = openToken;
    void lookupRhymes(hit.text, (w) => !isMisspelled(w)).then((result) => {
      if (token !== openToken) return;
      pending.remove();
      if (!result) {
        addLabel(section, 'No rhymes found');
        return;
      }
      if (result.perfect.length > 0) {
        addLabel(section, 'Rhymes');
        for (const word of result.perfect) {
          addItem(section, word, () => replaceRange(hit, matchCase(hit.text, word)));
        }
      }
      if (result.slant.length > 0) {
        addLabel(section, 'Near rhymes');
        for (const word of result.slant) {
          addItem(section, word, () => replaceRange(hit, matchCase(hit.text, word)));
        }
      }
      place(anchorX, anchorY);
    });
  }

  function buildMenu(hit: WordHit | null): void {
    menu.replaceChildren();

    if (hit) {
      if (isMisspelled(hit.text)) {
        const suggestions = spellSuggestions(hit.text);
        addLabel(menu, 'Spelling');
        if (suggestions.length === 0) {
          addLabel(menu, 'No suggestions');
        }
        for (const suggestion of suggestions) {
          addItem(menu, suggestion, () => replaceRange(hit, suggestion));
        }
        addItem(menu, `Add “${hit.text}” to dictionary`, () => {
          addToUserDictionary(hit.text);
          refreshSpellcheck(view);
        });
        addSeparator(menu);
      } else if (isInUserDictionary(hit.text)) {
        addItem(menu, `Remove “${hit.text}” from dictionary`, () => {
          removeFromUserDictionary(hit.text);
          refreshSpellcheck(view);
        });
        addSeparator(menu);
      }
      buildSynonymSection(hit);
      if (options.showRhymes()) {
        addSeparator(menu);
        buildRhymeSection(hit);
      }
      addSeparator(menu);
    }

    const { from, to } = view.state.selection.main;
    if (from !== to) {
      const selected = view.state.doc.sliceString(from, to);
      addItem(menu, 'Cut', () => {
        void navigator.clipboard.writeText(selected).then(() => {
          view.dispatch({ changes: { from, to, insert: '' } });
          view.focus();
        });
      });
      addItem(menu, 'Copy', () => {
        void navigator.clipboard.writeText(selected);
        view.focus();
      });
    }
    addItem(menu, 'Paste', () => {
      navigator.clipboard
        .readText()
        .then((text) => {
          if (!text) return;
          const sel = view.state.selection.main;
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: text },
            selection: { anchor: sel.from + text.length },
          });
        })
        .catch(() => {
          /* clipboard unavailable */
        })
        .finally(() => view.focus());
    });
  }

  view.dom.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    close();
    openToken++;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const hit = pos === null ? null : wordAt(pos);

    if (hit) {
      const sel = view.state.selection.main;
      const insideSelection = sel.from !== sel.to && hit.from >= sel.from && hit.to <= sel.to;
      if (!insideSelection) {
        view.dispatch({ selection: { anchor: hit.from, head: hit.to } });
      }
    }

    buildMenu(hit);
    place(event.clientX, event.clientY);
  });

  document.addEventListener(
    'mousedown',
    (event) => {
      if (!menu.hidden && !menu.contains(event.target as Node)) close();
    },
    true,
  );
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  view.scrollDOM.addEventListener('scroll', close);
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
}
