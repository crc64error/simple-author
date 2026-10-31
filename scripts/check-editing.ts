import assert from 'node:assert/strict';
import fs from 'node:fs';
import NSpell from 'nspell';
import { EditorState } from '@codemirror/state';
import { history, undo, undoDepth } from '@codemirror/commands';
import { linePrefixEdit, wrapEdit } from '../src/editor.ts';
import { findMatches, replaceAllChanges } from '../src/findbar.ts';
import { findGrammarIssues, type GrammarSettings } from '../src/grammar.ts';
import { canonicalName, lexiconChanges, readLexicon } from '../src/lexicon.ts';
import { classifyWord, type SpellDict } from '../src/spellcheck.ts';
import { isSentenceStart, lineEndsSentence } from '../src/prose.ts';
import { emptyLexicon, type Lexicon } from '../src/lexicon.ts';

function apply(state: EditorState, spec: Parameters<EditorState['update']>[0]): EditorState {
  return state.update(spec).state;
}

function docWithCursor(text: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({ doc: text, selection: { anchor, head } });
}

const dict: SpellDict = {
  spelledOk(straight, lexicon) {
    const lower = straight.toLowerCase().replace(/'s$/, '');
    if (lexicon.words.has(lower)) return true;
    return ['hello', 'the', 'she', 'said', 'dont', "don't", 'world', 'ran', 'to', 'iphone'].includes(lower);
  },
  suggest(straight) {
    if (straight.toLowerCase() === "i'm") return ["I'm"];
    if (straight.toLowerCase() === 'dont') return ["don't"];
    return [];
  },
};

function lexWith(names: string[] = [], words: string[] = []): Lexicon {
  const lex = emptyLexicon();
  for (const name of names) lex.names.set(name.toLowerCase(), name);
  for (const word of words) lex.words.add(word.toLowerCase());
  return lex;
}

function advice(word: string, sentenceStart: boolean, lex = emptyLexicon()) {
  return classifyWord(word, sentenceStart, lex, dict);
}

// --- cursor after toolbar inserts ---
{
  const state = docWithCursor('', 0);
  const next = apply(state, linePrefixEdit(state, '##'));
  assert.equal(next.doc.toString(), '## ');
  assert.equal(next.selection.main.head, 3);
}

{
  const state = docWithCursor('Hello', 0);
  const next = apply(state, linePrefixEdit(state, '## '));
  assert.equal(next.doc.toString(), '## Hello');
  assert.equal(next.selection.main.head, 3);
}

{
  const state = docWithCursor('Hello', 0, 5);
  const next = apply(state, linePrefixEdit(state, '#'));
  assert.equal(next.doc.toString(), '# Hello');
  assert.equal(next.selection.main.empty, true);
  assert.equal(next.selection.main.head, 2);
}

{
  const state = docWithCursor('One\nTwo', 0, 7);
  const next = apply(state, linePrefixEdit(state, '## '));
  assert.equal(next.doc.toString(), '## One\n## Two');
  assert.equal(next.selection.main.head, 3);
}

{
  const state = docWithCursor('## Hello', 8);
  const next = apply(state, linePrefixEdit(state, '## '));
  assert.equal(next.doc.toString(), 'Hello');
  assert.equal(next.selection.main.head, 5);
}

{
  const state = docWithCursor('word', 0, 4);
  const next = apply(state, wrapEdit(state, '*', '*'));
  assert.equal(next.doc.toString(), '*word*');
  assert.equal(next.selection.main.head, 6);
}

{
  const state = docWithCursor('Say ', 4);
  const next = apply(state, wrapEdit(state, '*', '*'));
  assert.equal(next.doc.toString(), 'Say **');
  assert.equal(next.selection.main.head, 5);
}

// --- find / replace, one undo for replace all ---
{
  assert.deepEqual(
    findMatches('The cat and the cat', { search: 'cat', replace: '', caseSensitive: false, wholeWord: true }),
    [
      { from: 4, to: 7 },
      { from: 16, to: 19 },
    ],
  );
  assert.equal(
    findMatches('The cat and the cat', { search: 'cat', replace: '', caseSensitive: true, wholeWord: false }).length,
    2,
  );
  assert.equal(
    findMatches('The Cat', { search: 'cat', replace: '', caseSensitive: true, wholeWord: false }).length,
    0,
  );
  assert.equal(
    findMatches('category cat', { search: 'cat', replace: '', caseSensitive: false, wholeWord: true }).length,
    1,
  );

  const view = {
    state: EditorState.create({
      doc: 'cat and cat and cat',
      extensions: [history()],
    }),
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      view.state = view.state.update(spec).state;
    },
  };
  view.dispatch({
    changes: { from: 0, to: 0, insert: '' },
    userEvent: 'input.type',
  });
  const before = undoDepth(view.state);
  const matches = findMatches(view.state.doc.toString(), {
    search: 'cat',
    replace: 'dog',
    caseSensitive: false,
    wholeWord: true,
  });
  view.dispatch({
    changes: replaceAllChanges(matches, 'dog'),
    userEvent: 'input.replace.all',
  });
  assert.equal(view.state.doc.toString(), 'dog and dog and dog');
  assert.equal(undoDepth(view.state), before + 1);
  assert.equal(undo(view), true);
  assert.equal(view.state.doc.toString(), 'cat and cat and cat');
  assert.equal(undo(view), false);
}

// --- names and capitalization ---
{
  assert.equal(canonicalName('elara'), 'Elara');
  assert.equal(canonicalName('ELARA'), 'Elara');
  assert.equal(canonicalName('McKay'), 'McKay');
  assert.equal(canonicalName('Elara'), 'Elara');

  let doc = 'She met Elara.\n';
  const withName = lexiconChanges(doc, lexWith(['Elara']));
  doc = doc.slice(0, withName[0].from) + withName[0].insert + doc.slice(withName[0].to);
  const lex = readLexicon(doc);
  assert.equal(lex.names.get('elara'), 'Elara');
  assert.equal(advice('elara', false, lex).suggestions[0], 'Elara');
  assert.equal(advice('Elara', false, lex).kind, 'ok');
  assert.equal(advice('ELARA', false, lex).kind, 'ok');
  assert.equal(advice("elara's", false, lex).suggestions[0], "Elara's");
  assert.equal(advice('glowmoss', false, lexWith([], ['glowmoss'])).kind, 'ok');

  assert.equal(advice('i', false).suggestions[0], 'I');
  assert.equal(advice('I', false).kind, 'ok');
  assert.equal(advice("i'm", false).suggestions[0], "I'm");
  assert.equal(advice("I’m", false).kind, 'ok');
  assert.equal(advice("don’t", false).kind, 'ok');
  assert.equal(advice('hello', true).suggestions[0], 'Hello');
  assert.equal(advice('hello', false).kind, 'ok');
  assert.equal(advice('iPhone', true).kind, 'ok');

  const spell = new NSpell(
    fs.readFileSync('public/dicts/en.aff', 'utf8'),
    fs.readFileSync('public/dicts/en.dic', 'utf8'),
  );
  const real: SpellDict = {
    spelledOk(straight) {
      return spell.correct(straight) || spell.correct(straight.toLowerCase());
    },
    suggest(straight) {
      return spell.suggest(straight).slice(0, 6);
    },
  };
  const realAdvice = (word: string, sentenceStart = false) =>
    classifyWord(word, sentenceStart, emptyLexicon(), real);
  assert.equal(realAdvice("don't").kind, 'ok');
  assert.equal(realAdvice('don’t').kind, 'ok');
  assert.equal(realAdvice("I'm").kind, 'ok');
  assert.equal(realAdvice("i'm").suggestions[0], "I'm");
  assert.equal(realAdvice('i').suggestions[0], 'I');
  assert.equal(realAdvice('hello', true).suggestions[0], 'Hello');

  const prose = 'She ran to the gate.\nhello there.';
  assert.equal(lineEndsSentence('She ran to the gate.'), true);
  assert.equal(lineEndsSentence('She ran to the'), false);
  assert.equal(lineEndsSentence('Mr. Smith'), false);
  assert.equal(isSentenceStart(prose, prose.indexOf('hello')), true);
  assert.equal(isSentenceStart(prose, prose.indexOf('there')), false);
  assert.equal(isSentenceStart('She said, "hello."', 'She said, "hello."'.indexOf('hello')), true);
  assert.equal(isSentenceStart('"Hello," she said.', '"Hello," she said.'.indexOf('she')), false);
}

// --- grammar hints, no rewrites ---
{
  const allOn: GrammarSettings = {
    enabled: true,
    rules: {
      repeat: true,
      'adverb-tag': true,
      passive: true,
      filter: true,
      echo: true,
      'long-sentence': true,
      'dialogue-punct': true,
      'said-bookism': true,
    },
  };
  const off = { ...allOn, enabled: false };
  const sample = [
    'She saw the the lantern.',
    'He said softly that the door was taken.',
    'He felt the lantern glow.',
    '"Hello". she said.',
    '"Hello." she said.',
    '"Hello" she said.',
    '"Stop," he whispered. "Run," he whispered. "Hide," he whispered.',
  ].join('\n');

  const issues = findGrammarIssues(sample, allOn);
  const rules = new Set(issues.map((issue) => issue.rule));
  for (const rule of [
    'repeat',
    'adverb-tag',
    'passive',
    'filter',
    'echo',
    'dialogue-punct',
    'said-bookism',
  ] as const) {
    assert.equal(rules.has(rule), true, `missing ${rule}`);
  }
  assert.equal(findGrammarIssues(sample, off).length, 0);

  const long = `${'word '.repeat(45).trim()}.`;
  assert.equal(findGrammarIssues(long, allOn).some((issue) => issue.rule === 'long-sentence'), true);

  const names = findGrammarIssues('Elara smiled.\nElara waved.', allOn);
  assert.equal(names.some((issue) => issue.rule === 'echo'), false);
}

console.log('editing checks passed');
