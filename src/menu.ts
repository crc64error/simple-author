import { isDesktopApp } from './platform';

export interface AppMenuHandlers {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onToggleView: () => void;
  onToggleNotes: () => void;
  onToggleMarks: () => void;
  onToggleOutline: () => void;
  onPublishGuide: () => void;
}

export async function setupAppMenu(handlers: AppMenuHandlers): Promise<void> {
  if (!isDesktopApp()) return;

  const { listen } = await import('@tauri-apps/api/event');

  await listen<string>('menu-action', (event) => {
    switch (event.payload) {
      case 'new':
        handlers.onNew();
        break;
      case 'open':
        handlers.onOpen();
        break;
      case 'save':
        handlers.onSave();
        break;
      case 'save-as':
        handlers.onSaveAs();
        break;
      // 'preview' is the id emitted by app builds predating the view toggle.
      case 'preview':
      case 'toggle-view':
        handlers.onToggleView();
        break;
      case 'toggle-notes':
        handlers.onToggleNotes();
        break;
      case 'toggle-marks':
        handlers.onToggleMarks();
        break;
      case 'toggle-outline':
        handlers.onToggleOutline();
        break;
      case 'publish-guide':
        handlers.onPublishGuide();
        break;
    }
  });
}