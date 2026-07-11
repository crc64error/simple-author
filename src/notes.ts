export const NOTE_OPEN = '[Notes]';
export const NOTE_CLOSE = '[/Notes]';

const OPEN_PATTERN = /^\[Notes\]$/i;
const CLOSE_PATTERN = /^\[\/Notes\]$/i;

export interface NoteBlock {
  start: number;
  end: number;
}

export function findNoteBlocks(doc: string): NoteBlock[] {
  const lines = doc.split('\n');
  const blocks: NoteBlock[] = [];
  let offset = 0;
  let blockStart = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (OPEN_PATTERN.test(trimmed)) {
      blockStart = offset;
    } else if (CLOSE_PATTERN.test(trimmed) && blockStart >= 0) {
      blocks.push({
        start: blockStart,
        end: offset + line.length + 1,
      });
      blockStart = -1;
    }
    offset += line.length + 1;
  }

  return blocks;
}

export function isLineInNotes(blocks: NoteBlock[], lineFrom: number): boolean {
  return blocks.some((block) => lineFrom >= block.start && lineFrom < block.end);
}

export function stripNotes(doc: string): string {
  const blocks = findNoteBlocks(doc);
  if (blocks.length === 0) return doc;

  let result = '';
  let last = 0;
  for (const block of blocks) {
    result += doc.slice(last, block.start);
    last = block.end;
  }
  result += doc.slice(last);

  return result.replace(/\n{3,}/g, '\n\n').trimEnd();
}