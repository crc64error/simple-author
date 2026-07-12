import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

export const setScriptureModeEffect = StateEffect.define<boolean>();

export const scriptureModeField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setScriptureModeEffect)) return effect.value;
    }
    return value;
  },
});

// Matching against the actual book names (not any capitalized word) keeps
// "Point 2" and "Verse 1" from lighting up.
const BOOKS = [
  'Genesis', 'Gen', 'Exodus', 'Exod?', 'Leviticus', 'Lev', 'Numbers', 'Num',
  'Deuteronomy', 'Deut', 'Joshua', 'Josh', 'Judges', 'Judg', 'Ruth',
  '[12] ?Samuel', '[12] ?Sam', '[12] ?Kings', '[12] ?Kgs',
  '[12] ?Chronicles', '[12] ?Chr(?:on)?', 'Ezra', 'Nehemiah', 'Neh',
  'Esther', 'Esth?', 'Job', 'Psalms?', 'Ps', 'Proverbs', 'Prov',
  'Ecclesiastes', 'Eccl', 'Song of Songs', 'Song of Solomon', 'Song',
  'Isaiah', 'Isa', 'Jeremiah', 'Jer', 'Lamentations', 'Lam',
  'Ezekiel', 'Ezek', 'Daniel', 'Dan', 'Hosea', 'Hos', 'Joel', 'Amos',
  'Obadiah', 'Obad', 'Jonah', 'Micah', 'Mic', 'Nahum', 'Nah',
  'Habakkuk', 'Hab', 'Zephaniah', 'Zeph', 'Haggai', 'Hag',
  'Zechariah', 'Zech', 'Malachi', 'Mal',
  'Matthew', 'Matt?', 'Mark', 'Luke', 'John', 'Acts', 'Romans', 'Rom',
  '[12] ?Corinthians', '[12] ?Cor', 'Galatians', 'Gal', 'Ephesians', 'Eph',
  'Philippians', 'Phil', 'Colossians', 'Col',
  '[12] ?Thessalonians', '[12] ?Thess', '[12] ?Timothy', '[12] ?Tim',
  'Titus', 'Philemon', 'Philem', 'Hebrews', 'Heb', 'James', 'Jas',
  '[12] ?Peter', '[12] ?Pet', '[123] ?John', 'Jude', 'Revelation', 'Rev',
];

// e.g. "John 3:16", "1 Cor 13:4-7", "Psalm 23", "Rom. 8:28,31"
const SCRIPTURE_PATTERN = new RegExp(
  `\\b(?:${BOOKS.join('|')})\\.? \\d{1,3}(?::\\d{1,3}(?:[-–]\\d{1,3})?(?:, ?\\d{1,3}(?:[-–]\\d{1,3})?)*)?\\b`,
  'g',
);

const scriptureMark = Decoration.mark({ class: 'cm-scripture' });

function buildDecorations(view: EditorView): DecorationSet {
  if (!view.state.field(scriptureModeField)) return Decoration.none;

  const decorations: { from: number; to: number }[] = [];
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      SCRIPTURE_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = SCRIPTURE_PATTERN.exec(line.text)) !== null) {
        decorations.push({
          from: line.from + match.index,
          to: line.from + match.index + match[0].length,
        });
      }
      if (line.number >= doc.lines) break;
      pos = line.to + 1;
    }
  }
  return Decoration.set(decorations.map((d) => scriptureMark.range(d.from, d.to)));
}

export const scripturePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const modeChanged =
        update.state.field(scriptureModeField) !== update.startState.field(scriptureModeField);
      if (update.docChanged || update.viewportChanged || modeChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const scriptureStyles = EditorView.baseTheme({
  '.cm-scripture': {
    color: 'var(--section)',
    fontWeight: '600',
  },
});
