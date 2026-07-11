const STORAGE_KEY = 'simple-writer-reminders';
const COLLAPSED_KEY = 'simple-writer-reminders-collapsed';

const DEFAULT_REMINDERS = `prep → action → reflection
6,000 to 8,000 words per chapter`;

export function createReminders(panel: HTMLElement): void {
  const input = panel.querySelector('#reminders-input') as HTMLTextAreaElement;
  const toggle = panel.querySelector('#btn-toggle-reminders') as HTMLButtonElement;

  input.value = loadReminders();
  setCollapsed(panel, loadCollapsed());
  updateToggleLabel(toggle, panel.classList.contains('collapsed'));

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, input.value);
    }, 300);
  });

  toggle.addEventListener('click', () => {
    const collapsed = !panel.classList.contains('collapsed');
    setCollapsed(panel, collapsed);
    updateToggleLabel(toggle, collapsed);
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    if (!collapsed) input.focus();
  });
}

function setCollapsed(panel: HTMLElement, collapsed: boolean): void {
  panel.classList.toggle('collapsed', collapsed);
  const body = panel.querySelector('.reminders-body') as HTMLElement;
  body.hidden = collapsed;
}

function updateToggleLabel(toggle: HTMLButtonElement, collapsed: boolean): void {
  toggle.textContent = collapsed ? '+' : '−';
  toggle.title = collapsed ? 'Show writing reminders' : 'Hide writing reminders';
  toggle.setAttribute('aria-expanded', String(!collapsed));
}

function loadReminders(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT_REMINDERS;
}

function loadCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_KEY) === 'true';
}