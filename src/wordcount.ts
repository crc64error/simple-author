export interface DocumentRegion {
  start: number;
  end: number;
  title: string;
}

export interface OutlineChapter {
  title: string;
  start: number;
}

export interface OutlineSection {
  title: string;
  start: number;
  chapters: OutlineChapter[];
}

import { stripNotes } from './notes';

export interface WordCountSnapshot {
  chapterWords: number;
  sectionWords: number;
  bookWords: number;
  chapterTitle: string;
  sectionTitle: string;
}

const SECTION_PATTERN = /^# (?!#)/;
const CHAPTER_PATTERN = /^## (?!#)/;

export function stripMarkup(text: string): string {
  return text
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/[—–-]/g, ' ')
    .trim();
}

export function countWords(text: string): number {
  const cleaned = stripMarkup(text);
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter((w) => w.length > 0).length;
}

// Verse/poem lines: content lines only — headings, blanks, and notes don't count.
export function countLines(text: string): number {
  return contentLines(stripNotes(text)).filter((line) => line !== '').length;
}

export function countStanzas(text: string): number {
  const lines = contentLines(stripNotes(text));
  let stanzas = 0;
  let inStanza = false;
  for (const line of lines) {
    if (line === '') {
      inStanza = false;
    } else if (!inStanza) {
      stanzas++;
      inStanza = true;
    }
  }
  return stanzas;
}

// Lines of the stanza (blank-line-delimited group) containing the cursor.
export function stanzaLinesAt(doc: string, cursorPos: number): number {
  const before = doc.slice(0, cursorPos);
  const lineIdx = before.split('\n').length - 1;
  const lines = doc.split('\n').map(normalizeContentLine);
  if (lines[lineIdx] === '') return 0;

  let count = 1;
  for (let i = lineIdx - 1; i >= 0 && lines[i] !== ''; i--) count++;
  for (let i = lineIdx + 1; i < lines.length && lines[i] !== ''; i++) count++;
  return count;
}

const SPEAKING_WPM = 130;

export function speakingMinutes(words: number): number {
  return Math.round(words / SPEAKING_WPM);
}

function normalizeContentLine(line: string): string {
  if (/^#{1,3}\s/.test(line)) return '';
  if (/^\[(?:\/)?Notes\]$/i.test(line.trim())) return '';
  return line.trim();
}

function contentLines(text: string): string[] {
  return text.split('\n').map(normalizeContentLine);
}

export function findRegions(doc: string): { sections: DocumentRegion[]; chapters: DocumentRegion[] } {
  const lines = doc.split('\n');
  const sections: DocumentRegion[] = [];
  const chapters: DocumentRegion[] = [];

  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SECTION_PATTERN.test(line)) {
      sections.push({
        start: offset,
        end: doc.length,
        title: line.replace(/^#\s+/, '').trim() || 'Untitled Section',
      });
      if (sections.length > 1) {
        sections[sections.length - 2].end = offset;
      }
    }
    if (CHAPTER_PATTERN.test(line)) {
      chapters.push({
        start: offset,
        end: doc.length,
        title: line.replace(/^##\s+/, '').trim() || 'Untitled Chapter',
      });
      if (chapters.length > 1) {
        chapters[chapters.length - 2].end = offset;
      }
    }
    offset += line.length + 1;
  }

  return { sections, chapters };
}

export function buildOutline(doc: string): OutlineSection[] {
  const lines = doc.split('\n');
  const outline: OutlineSection[] = [];
  let offset = 0;
  let currentSection: OutlineSection | null = null;

  for (const line of lines) {
    if (SECTION_PATTERN.test(line)) {
      currentSection = {
        title: line.replace(/^#\s+/, '').trim() || 'Untitled Section',
        start: offset,
        chapters: [],
      };
      outline.push(currentSection);
    } else if (CHAPTER_PATTERN.test(line) && currentSection) {
      currentSection.chapters.push({
        title: line.replace(/^##\s+/, '').trim() || 'Untitled Chapter',
        start: offset,
      });
    }
    offset += line.length + 1;
  }

  return outline;
}

export function activeOutlineIndices(
  outline: OutlineSection[],
  cursorPos: number,
): { section: number; chapter: number | null } {
  let sectionIdx = -1;
  let chapterIdx: number | null = null;

  for (let i = 0; i < outline.length; i++) {
    if (cursorPos >= outline[i].start) {
      sectionIdx = i;
      chapterIdx = null;
      for (let j = 0; j < outline[i].chapters.length; j++) {
        if (cursorPos >= outline[i].chapters[j].start) {
          chapterIdx = j;
        }
      }
    }
  }

  return { section: sectionIdx, chapter: chapterIdx };
}

function regionAtCursor(regions: DocumentRegion[], pos: number): DocumentRegion | null {
  if (regions.length === 0) return null;
  for (let i = regions.length - 1; i >= 0; i--) {
    if (pos >= regions[i].start) return regions[i];
  }
  return regions[0];
}

// The `#` and `##` region texts containing the cursor (whole doc when the
// document has no headings yet).
export function regionTextsAt(
  doc: string,
  cursorPos: number,
): { sectionText: string; chapterText: string } {
  const { sections, chapters } = findRegions(doc);
  const section = regionAtCursor(sections, cursorPos);
  const chapter = regionAtCursor(chapters, cursorPos);

  const sectionText = section ? doc.slice(section.start, section.end) : doc;
  const chapterText = chapter
    ? doc.slice(chapter.start, chapter.end)
    : section
      ? sectionText
      : doc;
  return { sectionText, chapterText };
}

export function computeWordCounts(doc: string, cursorPos: number): WordCountSnapshot {
  const bookWords = countWords(stripNotes(doc));
  const { sections, chapters } = findRegions(doc);

  const section = regionAtCursor(sections, cursorPos);
  const chapter = regionAtCursor(chapters, cursorPos);

  const sectionText = section ? doc.slice(section.start, section.end) : doc;
  const chapterText = chapter
    ? doc.slice(chapter.start, chapter.end)
    : section
      ? sectionText
      : doc;

  return {
    chapterWords: countWords(stripNotes(chapterText)),
    sectionWords: countWords(stripNotes(sectionText)),
    bookWords,
    chapterTitle: chapter?.title ?? '—',
    sectionTitle: section?.title ?? '—',
  };
}