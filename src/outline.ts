import {
  activeOutlineIndices,
  buildOutline,
  type OutlineSection,
} from './wordcount';

export function createOutline(
  container: HTMLElement,
  onNavigate: (pos: number) => void,
): { update: (doc: string, cursorPos: number) => void; setCollapsed: (collapsed: boolean) => void } {
  const list = container.querySelector('.outline-list') as HTMLElement;
  const empty = container.querySelector('.outline-empty') as HTMLElement;

  function render(doc: string, cursorPos: number): void {
    const outline = buildOutline(doc);
    const active = activeOutlineIndices(outline, cursorPos);

    list.replaceChildren();

    if (outline.length === 0) {
      empty.hidden = false;
      list.hidden = true;
      return;
    }

    empty.hidden = true;
    list.hidden = false;

    outline.forEach((section, sectionIdx) => {
      list.appendChild(renderSection(section, sectionIdx, active, onNavigate));
    });
  }

  return {
    update: render,
    setCollapsed: (collapsed: boolean) => {
      container.classList.toggle('collapsed', collapsed);
    },
  };
}

function renderSection(
  section: OutlineSection,
  sectionIdx: number,
  active: { section: number; chapter: number | null },
  onNavigate: (pos: number) => void,
): HTMLElement {
  const item = document.createElement('li');
  item.className = 'outline-section';

  const sectionBtn = document.createElement('button');
  sectionBtn.type = 'button';
  sectionBtn.className = 'outline-item outline-section-btn';
  if (sectionIdx === active.section && active.chapter === null) {
    sectionBtn.classList.add('active');
  }
  sectionBtn.innerHTML = `<span class="outline-index">${sectionIdx + 1}</span><span class="outline-label">${escapeHtml(section.title)}</span>`;
  sectionBtn.addEventListener('click', () => onNavigate(section.start));
  item.appendChild(sectionBtn);

  if (section.chapters.length > 0) {
    const chapterList = document.createElement('ul');
    chapterList.className = 'outline-chapters';

    section.chapters.forEach((chapter, chapterIdx) => {
      const chapterItem = document.createElement('li');
      const chapterBtn = document.createElement('button');
      chapterBtn.type = 'button';
      chapterBtn.className = 'outline-item outline-chapter-btn';
      if (sectionIdx === active.section && chapterIdx === active.chapter) {
        chapterBtn.classList.add('active');
      }
      chapterBtn.innerHTML = `<span class="outline-label">${escapeHtml(chapter.title)}</span>`;
      chapterBtn.addEventListener('click', () => onNavigate(chapter.start));
      chapterItem.appendChild(chapterBtn);
      chapterList.appendChild(chapterItem);
    });

    item.appendChild(chapterList);
  }

  return item;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}