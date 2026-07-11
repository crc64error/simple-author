function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const parts: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];
  let inList = false;

  const flushList = (): void => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  const flushTable = (): void => {
    if (!inTable) return;
    const rows = tableRows.filter((r) => !/^\|[\s-:|]+\|$/.test(r.trim()));
    if (rows.length > 0) {
      const header = rows[0].split('|').filter(Boolean).map((c) => c.trim());
      const body = rows.slice(1);
      parts.push('<table><thead><tr>');
      for (const cell of header) parts.push(`<th>${inlineMarkdown(cell)}</th>`);
      parts.push('</tr></thead><tbody>');
      for (const row of body) {
        const cells = row.split('|').filter(Boolean).map((c) => c.trim());
        parts.push('<tr>');
        for (const cell of cells) parts.push(`<td>${inlineMarkdown(cell)}</td>`);
        parts.push('</tr>');
      }
      parts.push('</tbody></table>');
    }
    tableRows = [];
    inTable = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('|')) {
      flushList();
      inTable = true;
      tableRows.push(trimmed);
      continue;
    }
    if (inTable) flushTable();

    if (trimmed === '---') {
      flushList();
      parts.push('<hr>');
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      parts.push(`<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      parts.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      parts.push(`<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${inlineMarkdown(trimmed.slice(2))}</li>`);
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      parts.push(`<p class="guide-step">${inlineMarkdown(trimmed)}</p>`);
      continue;
    }

    if (trimmed === '') {
      flushList();
      continue;
    }

    flushList();
    parts.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  flushTable();
  return parts.join('\n');
}

export function createPublishingModal(): {
  open: () => Promise<void>;
  close: () => void;
} {
  const backdrop = document.getElementById('publish-modal')!;
  const body = document.getElementById('publish-modal-body')!;
  const closeBtn = document.getElementById('publish-modal-close')!;
  let loaded = false;

  const close = (): void => {
    backdrop.hidden = true;
    document.body.classList.remove('modal-open');
  };

  const open = async (): Promise<void> => {
    if (!loaded) {
      const response = await fetch('./publishing.md');
      const md = await response.text();
      body.innerHTML = markdownToHtml(md);
      loaded = true;
    }
    backdrop.hidden = false;
    document.body.classList.add('modal-open');
    closeBtn.focus();
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !backdrop.hidden) close();
  });

  return { open, close };
}