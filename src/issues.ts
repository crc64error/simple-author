// A reading-order list of the cached spelling and grammar results.
// Choosing a row selects that span and scrolls it into view.

import type { SpellMark } from './analysis-cache';
import type { AnalysisChapter } from './analysis';
import type { GrammarIssue } from './grammar';

export interface IssueEntry {
  from: number;
  to: number;
  kind: 'spelling' | 'grammar';
  label: string;
  excerpt: string;
}

function excerptOf(doc: string, from: number, to: number): string {
  if (from < 0 || to > doc.length || from >= to) return '';
  const text = doc.slice(from, to).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

export function collectIssues(doc: string, chapters: AnalysisChapter[]): IssueEntry[] {
  const items: IssueEntry[] = [];
  const seen = new Set<string>();

  const add = (entry: IssueEntry): void => {
    const key = `${entry.kind}:${entry.from}:${entry.to}:${entry.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(entry);
  };

  for (const chapter of chapters) {
    for (const issue of chapter.grammar) addGrammar(doc, issue, add);
    for (const mark of chapter.spelling) addSpelling(doc, mark, add);
  }

  items.sort((a, b) => a.from - b.from || a.to - b.to || a.label.localeCompare(b.label));
  return items;
}

function addGrammar(doc: string, issue: GrammarIssue, add: (entry: IssueEntry) => void): void {
  const excerpt = excerptOf(doc, issue.from, issue.to);
  if (!excerpt) return;
  add({
    from: issue.from,
    to: issue.to,
    kind: 'grammar',
    label: issue.message,
    excerpt,
  });
}

function addSpelling(doc: string, mark: SpellMark, add: (entry: IssueEntry) => void): void {
  const excerpt = excerptOf(doc, mark.from, mark.to);
  if (!excerpt) return;
  add({
    from: mark.from,
    to: mark.to,
    kind: 'spelling',
    label: 'Spelling',
    excerpt,
  });
}

export function createIssuesPanel(
  container: HTMLElement,
  onOpen: (from: number, to: number) => void,
): {
  show: (doc: string, chapters: AnalysisChapter[]) => void;
  syncCursor: (pos: number) => void;
} {
  const countEl = container.querySelector('.issues-count') as HTMLElement;
  const body = container.querySelector('.issues-body') as HTMLElement;
  let items: IssueEntry[] = [];
  let ready = false;

  const empty = document.createElement('p');
  empty.className = 'issues-empty';
  const list = document.createElement('ul');
  list.className = 'issues-list';
  body.replaceChildren(empty, list);

  function renderEmpty(message: string): void {
    empty.hidden = false;
    empty.textContent = message;
    list.hidden = true;
    list.replaceChildren();
    countEl.textContent = '';
  }

  function show(doc: string, chapters: AnalysisChapter[]): void {
    ready = true;
    items = collectIssues(doc, chapters);
    if (items.length === 0) {
      renderEmpty('No spelling or grammar issues.');
      return;
    }

    empty.hidden = true;
    list.hidden = false;
    countEl.textContent = String(items.length);
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `issue-item ${item.kind}`;
      button.title = item.kind === 'spelling' ? `Spelling: ${item.excerpt}` : item.label;

      const excerpt = document.createElement('span');
      excerpt.className = 'issue-excerpt';
      excerpt.textContent = item.excerpt;

      const label = document.createElement('span');
      label.className = 'issue-label';
      label.textContent = item.label;

      button.append(excerpt, label);
      button.addEventListener('click', () => onOpen(item.from, item.to));
      row.appendChild(button);
      fragment.appendChild(row);
    }
    list.replaceChildren(fragment);
  }

  function syncCursor(pos: number): void {
    if (!ready) return;
    const buttons = list.querySelectorAll<HTMLButtonElement>('.issue-item');
    let activeIndex = -1;
    buttons.forEach((button, index) => {
      const item = items[index];
      const on = Boolean(item && pos >= item.from && pos <= item.to);
      button.classList.toggle('active', on);
      if (on && activeIndex < 0) activeIndex = index;
    });
    if (activeIndex >= 0) buttons[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  renderEmpty('Checking the manuscript…');

  return { show, syncCursor };
}
