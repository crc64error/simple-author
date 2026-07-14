import type { EditorState } from '@codemirror/state';
import { BLANK_DOCUMENTS, type WritingModeId } from './modes';

export interface TabRecord {
  id: string;
  filePath: string | null;
  modeId: WritingModeId;
  // Content at the last open/save-to-file; null for never-saved tabs.
  // Drives the dirty dot and the close confirmation.
  savedContent: string | null;
}

interface TabsOptions {
  container: HTMLElement;
  createState: (content: string) => EditorState;
  getViewState: () => EditorState;
  setViewState: (state: EditorState) => void;
  // Runs after a tab's document is in the view: apply its mode, window title.
  onActivate: (tab: TabRecord) => void;
  defaultModeId: () => WritingModeId;
  welcome: string;
}

export interface TabsApi {
  activeTab: () => TabRecord;
  draftKey: () => string;
  newTab: (content: string, modeId: WritingModeId) => void;
  openDocument: (filePath: string | null, text: string) => void;
  markSaved: (filePath: string | null) => void;
  setActiveMode: (modeId: WritingModeId) => void;
  refreshTitle: (doc: string) => void;
}

const TABS_KEY = 'simple-writer-tabs';
const LEGACY_DRAFT_KEY = 'simple-writer-draft';

const tabDraftKey = (id: string) => `simple-writer-tab-${id}`;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1].replace(/\.(md|txt|sw)$/i, '');
}

function headingTitle(doc: string): string | null {
  const match = doc.match(/^# (?!#)(.+)$/m);
  if (!match) return null;
  const title = match[1].replace(/[—–-]\s*$/, '').trim();
  return title || null;
}

export function createTabs(options: TabsOptions): TabsApi {
  const { container, createState, getViewState, setViewState, onActivate } = options;

  let tabs: TabRecord[] = [];
  let activeId = '';
  const states = new Map<string, EditorState>();
  const labels = new Map<string, string>();

  function persist(): void {
    writeStorage(
      TABS_KEY,
      JSON.stringify({
        active: activeId,
        tabs: tabs.map(({ id, filePath, modeId }) => ({ id, filePath, modeId })),
      }),
    );
  }

  function tabContent(tab: TabRecord): string {
    if (tab.id === activeId) return getViewState().doc.toString();
    return readStorage(tabDraftKey(tab.id)) ?? '';
  }

  function isDirty(tab: TabRecord): boolean {
    const content = tabContent(tab);
    if (tab.savedContent !== null) return content !== tab.savedContent;
    const trimmed = content.trim();
    // An untouched blank template isn't worth protecting.
    return trimmed !== '' && !BLANK_DOCUMENTS.some((blank) => trimmed === blank.trim());
  }

  function tabLabel(tab: TabRecord): string {
    if (tab.filePath) return basename(tab.filePath);
    return headingTitle(tabContent(tab)) ?? 'Untitled';
  }

  function activate(id: string): void {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;

    if (activeId && activeId !== id) {
      states.set(activeId, getViewState());
    }
    // Set the active pointer first so autosave writes land in the right slot.
    activeId = id;
    const cached = states.get(id);
    setViewState(cached ?? createState(readStorage(tabDraftKey(id)) ?? ''));
    persist();
    render();
    onActivate(tab);
  }

  function close(id: string): void {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;

    if (isDirty(tab)) {
      const name = tabLabel(tab);
      const proceed = confirm(
        `Close “${name}”? It has changes that aren't saved to a file, and its draft will be discarded.`,
      );
      if (!proceed) return;
    }

    tabs = tabs.filter((t) => t.id !== id);
    states.delete(id);
    labels.delete(id);
    try {
      localStorage.removeItem(tabDraftKey(id));
    } catch {
      /* ignore */
    }

    if (tabs.length === 0) {
      addTab('', options.defaultModeId(), null, null);
      return;
    }
    if (id === activeId) {
      activeId = '';
      activate(tabs[tabs.length - 1].id);
    } else {
      persist();
      render();
    }
  }

  function addTab(
    content: string,
    modeId: WritingModeId,
    filePath: string | null,
    savedContent: string | null,
  ): void {
    const tab: TabRecord = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      filePath,
      modeId,
      savedContent,
    };
    tabs.push(tab);
    writeStorage(tabDraftKey(tab.id), content);
    activate(tab.id);
  }

  function render(): void {
    container.replaceChildren();

    for (const tab of tabs) {
      const label = tabLabel(tab);
      labels.set(tab.id, label);

      const el = document.createElement('div');
      el.className = 'tab';
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', String(tab.id === activeId));
      if (tab.id === activeId) el.classList.add('active');

      const name = document.createElement('span');
      name.className = 'tab-label';
      name.textContent = label;
      if (tab.filePath) el.title = tab.filePath;
      el.appendChild(name);

      if (isDirty(tab)) {
        const dot = document.createElement('span');
        dot.className = 'tab-dirty';
        dot.textContent = '•';
        dot.title = 'Not saved to a file';
        el.appendChild(dot);
      }

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'Close tab';
      closeBtn.setAttribute('aria-label', `Close ${label}`);
      // Tabs activate on mousedown, so the close button must swallow that too
      // or closing an inactive tab would first switch to it.
      closeBtn.addEventListener('mousedown', (event) => event.stopPropagation());
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        close(tab.id);
      });
      el.appendChild(closeBtn);

      el.addEventListener('mousedown', () => {
        if (tab.id !== activeId) activate(tab.id);
      });
      container.appendChild(el);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'New tab';
    addBtn.addEventListener('click', () => addTab('', options.defaultModeId(), null, null));
    container.appendChild(addBtn);
  }

  // --- Restore persisted tabs (or migrate the single pre-tabs draft) ---
  const stored = readStorage(TABS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as {
        active: string;
        tabs: { id: string; filePath: string | null; modeId: WritingModeId }[];
      };
      tabs = parsed.tabs.map((t) => ({
        ...t,
        // File-backed tabs are assumed in sync with disk after a restart;
        // dirty tracking restarts from the current draft.
        savedContent: t.filePath ? readStorage(tabDraftKey(t.id)) : null,
      }));
      activeId = '';
      if (tabs.length > 0) {
        const active = tabs.some((t) => t.id === parsed.active) ? parsed.active : tabs[0].id;
        activate(active);
      }
    } catch {
      tabs = [];
    }
  }
  if (tabs.length === 0) {
    const legacy = readStorage(LEGACY_DRAFT_KEY);
    addTab(legacy ?? options.welcome, options.defaultModeId(), null, null);
  }

  return {
    activeTab: () => tabs.find((t) => t.id === activeId)!,
    draftKey: () => tabDraftKey(activeId),
    newTab: (content, modeId) => addTab(content, modeId, null, null),
    openDocument: (filePath, text) => {
      if (filePath) {
        const existing = tabs.find((t) => t.filePath === filePath);
        if (existing) {
          writeStorage(tabDraftKey(existing.id), text);
          existing.savedContent = text;
          states.delete(existing.id);
          if (existing.id === activeId) {
            setViewState(createState(text));
            render();
            onActivate(existing);
          } else {
            activate(existing.id);
          }
          return;
        }
      }
      addTab(text, options.defaultModeId(), filePath, text);
    },
    markSaved: (filePath) => {
      const tab = tabs.find((t) => t.id === activeId);
      if (!tab) return;
      if (filePath) tab.filePath = filePath;
      tab.savedContent = getViewState().doc.toString();
      persist();
      render();
    },
    setActiveMode: (modeId) => {
      const tab = tabs.find((t) => t.id === activeId);
      if (!tab) return;
      tab.modeId = modeId;
      persist();
    },
    refreshTitle: (doc) => {
      const tab = tabs.find((t) => t.id === activeId);
      if (!tab) return;
      const label = tab.filePath ? basename(tab.filePath) : (headingTitle(doc) ?? 'Untitled');
      if (labels.get(tab.id) !== label) render();
      else {
        // Cheap dirty-dot refresh without rebuilding the bar.
        const activeEl = container.querySelector('.tab.active');
        const hasDot = !!activeEl?.querySelector('.tab-dirty');
        if (hasDot !== isDirty(tab)) render();
      }
    },
  };
}
