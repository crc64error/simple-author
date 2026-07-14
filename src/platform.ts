import { isTauri } from '@tauri-apps/api/core';

const MANUSCRIPT_FILTERS = [
  {
    name: 'Manuscript',
    extensions: ['md', 'txt', 'sw'],
  },
];

export function isDesktopApp(): boolean {
  return isTauri();
}

export async function setWindowTitle(filePath: string | null): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const name = filePath ? filePath.split(/[/\\]/).pop() : null;
    await getCurrentWebviewWindow().setTitle(name ? `${name} — Simple Author` : 'Simple Author');
  } catch (error) {
    // A title update should never block opening or saving the manuscript.
    console.error('Failed to set window title:', error);
  }
}

export async function openManuscript(): Promise<{ path: string; text: string } | null> {
  if (!isDesktopApp()) return null;

  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readTextFile } = await import('@tauri-apps/plugin-fs');

  const selected = await open({
    multiple: false,
    directory: false,
    filters: MANUSCRIPT_FILTERS,
  });

  if (!selected || typeof selected !== 'string') return null;

  return { path: selected, text: await readTextFile(selected) };
}

// Saves to `currentPath` when known (unless saveAs); otherwise prompts.
// Returns the path written to, or null if the user cancelled.
export async function saveManuscript(
  content: string,
  currentPath: string | null,
  saveAs = false,
): Promise<string | null> {
  if (!isDesktopApp()) return null;

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');

  let target = currentPath;
  if (!target || saveAs) {
    const selected = await save({
      defaultPath: currentPath ?? 'manuscript.md',
      filters: MANUSCRIPT_FILTERS,
    });
    if (!selected || typeof selected !== 'string') return null;
    target = selected;
  }

  await writeTextFile(target, content);
  return target;
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
