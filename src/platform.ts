import { isTauri } from '@tauri-apps/api/core';

const MANUSCRIPT_FILTERS = [
  {
    name: 'Manuscript',
    extensions: ['md', 'txt', 'sw'],
  },
];

let currentFilePath: string | null = null;

export function isDesktopApp(): boolean {
  return isTauri();
}

export function getCurrentFilePath(): string | null {
  return currentFilePath;
}

export function getDisplayTitle(): string {
  if (!currentFilePath) return 'Simple Author';
  const parts = currentFilePath.split(/[/\\]/);
  return `${parts[parts.length - 1]} — Simple Author`;
}

async function setWindowTitle(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().setTitle(getDisplayTitle());
  } catch (error) {
    // A title update should never block opening or saving the manuscript.
    console.error('Failed to set window title:', error);
  }
}

export async function openManuscript(): Promise<string | null> {
  if (!isDesktopApp()) return null;

  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readTextFile } = await import('@tauri-apps/plugin-fs');

  const selected = await open({
    multiple: false,
    directory: false,
    filters: MANUSCRIPT_FILTERS,
  });

  if (!selected || typeof selected !== 'string') return null;

  currentFilePath = selected;
  await setWindowTitle();
  return readTextFile(selected);
}

export async function saveManuscript(content: string, saveAs = false): Promise<boolean> {
  if (!isDesktopApp()) return false;

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');

  let target = currentFilePath;
  if (!target || saveAs) {
    const selected = await save({
      defaultPath: currentFilePath ?? 'manuscript.md',
      filters: MANUSCRIPT_FILTERS,
    });
    if (!selected || typeof selected !== 'string') return false;
    target = selected;
    currentFilePath = target;
  }

  await writeTextFile(target, content);
  await setWindowTitle();
  return true;
}

export function resetCurrentFile(): void {
  currentFilePath = null;
  void setWindowTitle();
}

export async function saveExportBlob(filename: string, blob: Blob): Promise<boolean> {
  if (!isDesktopApp()) return false;

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeFile } = await import('@tauri-apps/plugin-fs');

  const ext = filename.split('.').pop() ?? 'md';
  const selected = await save({
    defaultPath: filename,
    filters: [{ name: 'Export', extensions: [ext] }],
  });

  if (!selected || typeof selected !== 'string') return false;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(selected, bytes);
  return true;
}