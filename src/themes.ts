import { EditorView } from '@codemirror/view';

export type ThemeId = 'forest' | 'midnight' | 'parchment' | 'slate';

export interface AppTheme {
  id: ThemeId;
  label: string;
  vars: Record<string, string>;
}

export const themes: AppTheme[] = [
  {
    id: 'forest',
    label: 'Forest',
    vars: {
      '--bg': '#1a2319',
      '--bg-elevated': '#243024',
      '--bg-toolbar': '#1f2a1e',
      '--text': '#e8efe4',
      '--text-muted': '#9bb094',
      '--accent': '#7cb87a',
      '--accent-soft': '#3d5c3b',
      '--border': '#354433',
      '--chapter': '#a8d5a2',
      '--section': '#8ec9e8',
      '--emphasis': '#d4a5e8',
      '--notes': '#c9a86c',
      '--notes-bg': 'rgba(201, 168, 108, 0.08)',
      '--notes-text': '#b8a882',
      '--reminders': '#8ec9e8',
      '--reminders-bg': 'rgba(142, 201, 232, 0.06)',
      '--reminders-text': '#c5dce8',
      '--invisibles': '#7a9a75',
      '--spell-error': '#e87878',
      '--selection': 'rgba(124, 184, 122, 0.25)',
      '--font-editor': '"Crimson Pro", Georgia, serif',
      '--font-ui': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    vars: {
      '--bg': '#12141a',
      '--bg-elevated': '#1a1e28',
      '--bg-toolbar': '#151820',
      '--text': '#e4e6ed',
      '--text-muted': '#8b90a0',
      '--accent': '#6b9fff',
      '--accent-soft': '#2a3f66',
      '--border': '#2a3040',
      '--chapter': '#9ec5ff',
      '--section': '#7dd3c0',
      '--emphasis': '#c9a0dc',
      '--notes': '#d4a96a',
      '--notes-bg': 'rgba(212, 169, 106, 0.1)',
      '--notes-text': '#a8a090',
      '--reminders': '#7dd3c0',
      '--reminders-bg': 'rgba(125, 211, 192, 0.08)',
      '--reminders-text': '#a8c8c0',
      '--invisibles': '#6a7a9a',
      '--spell-error': '#ff7b7b',
      '--selection': 'rgba(107, 159, 255, 0.22)',
      '--font-editor': '"Crimson Pro", Georgia, serif',
      '--font-ui': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'parchment',
    label: 'Parchment',
    vars: {
      '--bg': '#f5f0e6',
      '--bg-elevated': '#faf7f0',
      '--bg-toolbar': '#ebe4d6',
      '--text': '#2c2416',
      '--text-muted': '#7a6f5c',
      '--accent': '#8b6914',
      '--accent-soft': '#d4c4a0',
      '--border': '#d8cdb8',
      '--chapter': '#5c4a1f',
      '--section': '#3d5c4a',
      '--emphasis': '#6b3d6b',
      '--notes': '#8b6914',
      '--notes-bg': 'rgba(139, 105, 20, 0.08)',
      '--notes-text': '#7a6f5c',
      '--reminders': '#3d5c4a',
      '--reminders-bg': 'rgba(61, 92, 74, 0.06)',
      '--reminders-text': '#4a5c52',
      '--invisibles': '#a09070',
      '--spell-error': '#c44',
      '--selection': 'rgba(139, 105, 20, 0.18)',
      '--font-editor': '"Crimson Pro", Georgia, serif',
      '--font-ui': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    vars: {
      '--bg': '#2b3038',
      '--bg-elevated': '#343a44',
      '--bg-toolbar': '#252a32',
      '--text': '#e8eaed',
      '--text-muted': '#9aa0ab',
      '--accent': '#7eb8da',
      '--accent-soft': '#3d5568',
      '--border': '#434a56',
      '--chapter': '#a8cce8',
      '--section': '#8ed4b8',
      '--emphasis': '#d4a8e0',
      '--notes': '#c9b070',
      '--notes-bg': 'rgba(201, 176, 112, 0.1)',
      '--notes-text': '#a0a8b0',
      '--reminders': '#8ed4b8',
      '--reminders-bg': 'rgba(142, 212, 184, 0.08)',
      '--reminders-text': '#b0c8bc',
      '--invisibles': '#7a8a98',
      '--spell-error': '#f08080',
      '--selection': 'rgba(126, 184, 218, 0.22)',
      '--font-editor': '"Crimson Pro", Georgia, serif',
      '--font-ui': '"Source Sans 3", system-ui, sans-serif',
    },
  },
];

export function applyTheme(themeId: ThemeId): void {
  const theme = themes.find((t) => t.id === themeId) ?? themes[0];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = themeId;
}

export function editorTheme(): Extension {
  return EditorView.theme({
    '&': {
      backgroundColor: 'var(--bg-elevated)',
      color: 'var(--text)',
      fontSize: '20px',
      fontFamily: 'var(--font-editor)',
      lineHeight: '1.75',
    },
    '.cm-content': {
      padding: '2.5rem 0',
      maxWidth: '720px',
      margin: '0 auto',
      caretColor: 'var(--accent)',
    },
    '.cm-line': {
      padding: '0 2rem',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--selection) !important',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      border: 'none',
      color: 'var(--text-muted)',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  });
}

type Extension = ReturnType<typeof EditorView.theme>;