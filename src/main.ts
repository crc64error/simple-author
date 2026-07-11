import './styles.css';
import { createEditor, type EditorSnapshot } from './editor';
import { downloadBlob, getExportBlob } from './export';
import { setupAppMenu } from './menu';
import {
  isDesktopApp,
  openManuscript,
  resetCurrentFile,
  saveExportBlob,
  saveManuscript,
} from './platform';
import { createPublishingModal } from './publishing-guide';
import { createOutline } from './outline';
import { createReminders } from './reminders';
import { TEMPLATES } from './templates';
import { initSpellcheck, refreshSpellcheck } from './spellcheck';
import { setupContextMenu } from './context-menu';
import { initThesaurus } from './thesaurus';
import { applyTheme, type ThemeId } from './themes';

const chapterWordsEl = document.getElementById('chapter-words')!;
const sectionWordsEl = document.getElementById('section-words')!;
const bookWordsEl = document.getElementById('book-words')!;
const cursorContextEl = document.getElementById('cursor-context')!;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
const exportSelect = document.getElementById('export-select') as HTMLSelectElement;
const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
const viewMarkdownBtn = document.getElementById('btn-view-markdown') as HTMLButtonElement;
const viewRenderedBtn = document.getElementById('btn-view-rendered') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const editorContainer = document.getElementById('editor-container')!;

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function updateUI(snapshot: EditorSnapshot): void {
  const { counts, doc, cursorPos } = snapshot;

  chapterWordsEl.textContent = formatNumber(counts.chapterWords);
  sectionWordsEl.textContent = formatNumber(counts.sectionWords);
  bookWordsEl.textContent = formatNumber(counts.bookWords);

  const parts: string[] = [];
  if (counts.sectionTitle !== '—') parts.push(counts.sectionTitle);
  if (counts.chapterTitle !== '—') parts.push(counts.chapterTitle);
  cursorContextEl.textContent = parts.length > 0 ? parts.join(' · ') : '';

  outline.update(doc, cursorPos);
}

function loadTheme(): ThemeId {
  const saved = localStorage.getItem('simple-writer-theme') as ThemeId | null;
  if (saved && ['forest', 'midnight', 'parchment', 'slate'].includes(saved)) {
    return saved;
  }
  return 'forest';
}

const outlineSidebar = document.getElementById('outline-sidebar')!;
const outlineToggle = document.getElementById('btn-outline') as HTMLButtonElement;
const notesToggle = document.getElementById('btn-toggle-notes') as HTMLButtonElement;
const marksToggle = document.getElementById('btn-toggle-marks') as HTMLButtonElement;

let scrollToPosition: (pos: number) => void = () => {};

const outline = createOutline(outlineSidebar, (pos) => {
  scrollToPosition(pos);
});

function loadOutlineCollapsed(): boolean {
  return localStorage.getItem('simple-writer-outline-collapsed') === 'true';
}

function loadShowNotes(): boolean {
  return localStorage.getItem('simple-writer-show-notes') !== 'false';
}

function loadShowMarks(): boolean {
  return localStorage.getItem('simple-writer-show-marks') === 'true';
}

type ViewMode = 'markdown' | 'rendered';

function loadViewMode(): ViewMode {
  return localStorage.getItem('simple-writer-view-mode') === 'rendered' ? 'rendered' : 'markdown';
}

const outlineCollapsed = loadOutlineCollapsed();
outline.setCollapsed(outlineCollapsed);
outlineToggle.setAttribute('aria-pressed', String(!outlineCollapsed));

const showNotes = loadShowNotes();
const showMarks = loadShowMarks();

createReminders(document.getElementById('reminders-panel')!);

const editor = createEditor(
  document.getElementById('editor')!,
  editorContainer,
  updateUI,
);

scrollToPosition = (pos) => editor.scrollTo(pos);
editor.setShowNotes(showNotes);
notesToggle.textContent = showNotes ? 'Hide Notes' : 'Show Notes';
notesToggle.setAttribute('aria-pressed', String(showNotes));

editor.setShowInvisibles(showMarks);
marksToggle.textContent = showMarks ? 'Hide Marks' : 'Show Marks';
marksToggle.setAttribute('aria-pressed', String(showMarks));

let viewMode: ViewMode = loadViewMode();

function setViewMode(mode: ViewMode): void {
  viewMode = mode;
  editor.setRenderedMode(mode === 'rendered');
  viewMarkdownBtn.classList.toggle('active', mode === 'markdown');
  viewMarkdownBtn.setAttribute('aria-pressed', String(mode === 'markdown'));
  viewRenderedBtn.classList.toggle('active', mode === 'rendered');
  viewRenderedBtn.setAttribute('aria-pressed', String(mode === 'rendered'));
  localStorage.setItem('simple-writer-view-mode', mode);
}

function toggleViewMode(): void {
  setViewMode(viewMode === 'markdown' ? 'rendered' : 'markdown');
}

setViewMode(viewMode);

function toggleOutline(): void {
  const collapsed = !outlineSidebar.classList.contains('collapsed');
  outline.setCollapsed(collapsed);
  outlineToggle.setAttribute('aria-pressed', String(!collapsed));
  localStorage.setItem('simple-writer-outline-collapsed', String(collapsed));
}

function toggleNotes(): void {
  const visible = notesToggle.getAttribute('aria-pressed') !== 'true';
  editor.setShowNotes(visible);
  notesToggle.textContent = visible ? 'Hide Notes' : 'Show Notes';
  notesToggle.setAttribute('aria-pressed', String(visible));
  localStorage.setItem('simple-writer-show-notes', String(visible));
}

function toggleMarks(): void {
  const visible = marksToggle.getAttribute('aria-pressed') !== 'true';
  editor.setShowInvisibles(visible);
  marksToggle.textContent = visible ? 'Hide Marks' : 'Show Marks';
  marksToggle.setAttribute('aria-pressed', String(visible));
  localStorage.setItem('simple-writer-show-marks', String(visible));
}

async function handleNew(): Promise<void> {
  if (!editor.isEmpty()) {
    const proceed = confirm(
      'Start a new file? Your current manuscript will be replaced. Save first if you want to keep a copy.',
    );
    if (!proceed) return;
  }
  resetCurrentFile();
  editor.newDocument();
}

async function handleOpen(): Promise<void> {
  if (isDesktopApp()) {
    try {
      const text = await openManuscript();
      if (text !== null) editor.setContent(text);
    } catch (error) {
      console.error('Failed to open manuscript:', error);
    }
    return;
  }
  fileInput.click();
}

async function handleSave(saveAs = false): Promise<void> {
  const content = editor.getContent();

  if (isDesktopApp()) {
    const saved = await saveManuscript(content, saveAs);
    if (!saved && !saveAs) await saveManuscript(content, true);
    return;
  }

  downloadBlob(new Blob([content], { type: 'text/markdown' }), 'manuscript.md');
}

const publishModal = createPublishingModal();

for (const template of TEMPLATES) {
  const option = document.createElement('option');
  option.value = template.id;
  option.textContent = template.label;
  templateSelect.appendChild(option);
}

templateSelect.addEventListener('change', () => {
  const template = TEMPLATES.find((t) => t.id === templateSelect.value);
  if (template) editor.insertBlock(template.content, template.placement);
  templateSelect.value = '';
});

viewMarkdownBtn.addEventListener('click', () => setViewMode('markdown'));
viewRenderedBtn.addEventListener('click', () => setViewMode('rendered'));

outlineToggle.addEventListener('click', toggleOutline);
notesToggle.addEventListener('click', toggleNotes);
marksToggle.addEventListener('click', toggleMarks);

const theme = loadTheme();
applyTheme(theme);
themeSelect.value = theme;

themeSelect.addEventListener('change', () => {
  const id = themeSelect.value as ThemeId;
  applyTheme(id);
  localStorage.setItem('simple-writer-theme', id);
});

document.getElementById('btn-section')!.addEventListener('click', () => {
  editor.insertLinePrefix('# ');
});

document.getElementById('btn-chapter')!.addEventListener('click', () => {
  editor.insertLinePrefix('## ');
});

document.getElementById('btn-italic')!.addEventListener('click', () => {
  editor.wrapSelection('*', '*');
});

document.getElementById('btn-notes')!.addEventListener('click', () => {
  editor.wrapInNotes();
});

document.getElementById('btn-save')!.addEventListener('click', (event) => {
  void handleSave(event.shiftKey);
});

document.getElementById('btn-publish-guide')!.addEventListener('click', () => {
  publishModal.open();
});

document.getElementById('btn-new')!.addEventListener('click', () => {
  void handleNew();
});

exportSelect.addEventListener('change', async () => {
  const format = exportSelect.value as 'md' | 'txt' | 'epub' | '';
  if (!format) return;

  const { blob, filename } = await getExportBlob(editor.getContent(), format);
  if (isDesktopApp()) {
    const saved = await saveExportBlob(filename, blob);
    if (!saved) downloadBlob(blob, filename);
  } else {
    downloadBlob(blob, filename);
  }

  exportSelect.value = '';
});

document.getElementById('btn-open')!.addEventListener('click', () => {
  void handleOpen();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  editor.setContent(text);
  fileInput.value = '';
});

initSpellcheck().then(() => {
  refreshSpellcheck(editor.view);
});

setupContextMenu(editor.view);
void initThesaurus();

setupAppMenu({
  onNew: () => {
    void handleNew();
  },
  onOpen: () => {
    void handleOpen();
  },
  onSave: () => {
    void handleSave(false);
  },
  onSaveAs: () => {
    void handleSave(true);
  },
  onToggleView: toggleViewMode,
  onToggleNotes: toggleNotes,
  onToggleMarks: toggleMarks,
  onToggleOutline: toggleOutline,
  onPublishGuide: () => {
    publishModal.open();
  },
}).catch((error) => {
  console.error('Failed to set up menu listeners:', error);
});