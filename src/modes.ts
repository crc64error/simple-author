import {
  LYRICS_TEMPLATES,
  POETRY_TEMPLATES,
  SERMON_TEMPLATES,
  TEMPLATES,
  type ManuscriptTemplate,
} from './templates';
import {
  countLines,
  countWords,
  regionTextsAt,
  speakingMinutes,
  stanzaLinesAt,
  countStanzas,
} from './wordcount';
import { stripNotes } from './notes';
import { stripStyleBlocks } from './suno';

export type WritingModeId = 'book' | 'lyrics' | 'poetry' | 'sermon';

export interface StatValue {
  label: string;
  value: string;
  unit: string;
}

interface StatContext {
  doc: string;
  cursorPos: number;
  sectionText: string;
  chapterText: string;
}

export interface WritingMode {
  id: WritingModeId;
  label: string;
  topIcon: string;
  topLabel: string;
  subIcon: string;
  subLabel: string;
  outlineEmptyHtml: string;
  blankDocument: string;
  templates: ManuscriptTemplate[];
  scriptureHighlight: boolean;
  stats: (ctx: StatContext) => [StatValue, StatValue, StatValue];
}

function n(value: number): string {
  return value.toLocaleString();
}

const words = (text: string) => countWords(stripNotes(text));

export const MODES: WritingMode[] = [
  {
    id: 'book',
    label: 'Book',
    topIcon: '¶',
    topLabel: 'Section',
    subIcon: '§',
    subLabel: 'Chapter',
    outlineEmptyHtml:
      'No sections yet. Add a section with <code># Section 1 — Title</code>, then chapters with <code>## Chapter One</code>.',
    blankDocument: `# Section 1 —

## Chapter One

`,
    templates: TEMPLATES,
    scriptureHighlight: false,
    stats: ({ doc, sectionText, chapterText }) => [
      { label: 'Section', value: n(words(sectionText)), unit: 'words' },
      { label: 'Chapter', value: n(words(chapterText)), unit: 'words' },
      { label: 'Book', value: n(words(doc)), unit: 'words' },
    ],
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    topIcon: '♪',
    topLabel: 'Song',
    subIcon: '§',
    subLabel: 'Verse',
    outlineEmptyHtml:
      'No songs yet. Add a song with <code># Song Title</code>, then parts with <code>## Verse 1</code> or <code>## Chorus</code>.',
    blankDocument: `# Song Title

## Verse 1

`,
    templates: LYRICS_TEMPLATES,
    scriptureHighlight: false,
    stats: ({ doc, sectionText, chapterText }) => [
      { label: 'Song', value: n(countLines(stripStyleBlocks(sectionText))), unit: 'lines' },
      { label: 'Part', value: n(countLines(stripStyleBlocks(chapterText))), unit: 'lines' },
      { label: 'All', value: n(words(stripStyleBlocks(doc))), unit: 'words' },
    ],
  },
  {
    id: 'poetry',
    label: 'Poetry',
    topIcon: '❧',
    topLabel: 'Poem',
    subIcon: '§',
    subLabel: 'Part',
    outlineEmptyHtml:
      'No poems yet. Start one with <code># Poem Title</code>. Stanzas are simply separated by blank lines.',
    blankDocument: `# Poem Title

`,
    templates: POETRY_TEMPLATES,
    scriptureHighlight: false,
    stats: ({ doc, cursorPos, sectionText }) => [
      {
        label: 'Poem',
        value: `${n(countLines(sectionText))} · ${n(countStanzas(sectionText))}`,
        unit: 'lines · stanzas',
      },
      { label: 'Stanza', value: n(stanzaLinesAt(doc, cursorPos)), unit: 'lines' },
      { label: 'All', value: n(countLines(doc)), unit: 'lines' },
    ],
  },
  {
    id: 'sermon',
    label: 'Sermon',
    topIcon: '†',
    topLabel: 'Sermon',
    subIcon: '§',
    subLabel: 'Point',
    outlineEmptyHtml:
      'No sermons yet. Start one with <code># Sermon Title</code>, then points with <code>## Point 1</code>. Scripture references like <code>John 3:16</code> are highlighted automatically.',
    blankDocument: `# Sermon Title

## Opening

`,
    templates: SERMON_TEMPLATES,
    scriptureHighlight: true,
    stats: ({ sectionText, chapterText }) => {
      const sermonWords = words(sectionText);
      const minutes = speakingMinutes(sermonWords);
      return [
        { label: 'Sermon', value: n(sermonWords), unit: 'words' },
        { label: 'Point', value: n(words(chapterText)), unit: 'words' },
        { label: 'Speaking', value: minutes < 1 ? '< 1' : `≈ ${n(minutes)}`, unit: 'min' },
      ];
    },
  },
];

export const BLANK_DOCUMENTS = MODES.map((mode) => mode.blankDocument);

export function getMode(id: string | null): WritingMode {
  return MODES.find((mode) => mode.id === id) ?? MODES[0];
}

export function computeStats(
  mode: WritingMode,
  doc: string,
  cursorPos: number,
): [StatValue, StatValue, StatValue] {
  const { sectionText, chapterText } = regionTextsAt(doc, cursorPos);
  return mode.stats({ doc, cursorPos, sectionText, chapterText });
}
