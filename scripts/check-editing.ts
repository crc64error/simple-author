import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import NSpell from 'nspell';
import { EditorState } from '@codemirror/state';
import { history, undo, undoDepth } from '@codemirror/commands';
import { linePrefixEdit, wrapEdit } from '../src/editor.ts';
import { matchCachedChapters } from '../src/analysis-cache.ts';
import { chapterSlices, hashText, paragraphSlices } from '../src/analysis.ts';
import { findMatches, replaceAllChanges } from '../src/findbar.ts';
import { toEpub, toPlainText, toPublishMarkdown } from '../src/export.ts';
import { findGrammarIssues, type GrammarSettings } from '../src/grammar.ts';
import { findMathSpans, texToUnicode } from '../src/math.ts';
import { countWords } from '../src/wordcount.ts';
import { stampReleaseVersion, versionFromTag } from '../scripts/stamp-release-version.mjs';
import JSZip from 'jszip';
import { collectIssues } from '../src/issues.ts';
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

// --- cached analysis is reused by text hash ---
{
  const cached = [{ hash: 'a' }, { hash: 'b' }, { hash: 'c' }];
  const ids = (hashes: string[]) => matchCachedChapters(hashes, cached).map((item) => item?.hash ?? null);
  assert.deepEqual(ids(['a', 'b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(ids(['a', 'edited', 'c']), ['a', null, 'c']);
  assert.deepEqual(ids(['inserted', 'a', 'b', 'c']), [null, 'a', 'b', 'c']);
  assert.deepEqual(ids(['a', 'c']), ['a', 'c']);

  const doc = [
    '# One',
    '',
    'Alpha stays.',
    '',
    'Beta changes.',
    '',
    'Gamma stays.',
    '',
    '## Two',
    '',
    'Other chapter stays.',
  ].join('\n');
  const edited = doc.replace('Beta changes.', 'Beta changed.');
  const beforeChapters = chapterSlices(doc);
  const afterChapters = chapterSlices(edited);
  const chapterAligned = matchCachedChapters(
    afterChapters.map((chapter) => hashText(chapter.text)),
    beforeChapters.map((chapter) => ({ hash: hashText(chapter.text) })),
  );
  assert.equal(chapterAligned[0], null);
  assert.equal(chapterAligned[1]?.hash, hashText(beforeChapters[1].text));

  const beforeParas = paragraphSlices(beforeChapters[0].text);
  const afterParas = paragraphSlices(afterChapters[0].text);
  const aligned = matchCachedChapters(
    afterParas.map((paragraph) => hashText(paragraph.text)),
    beforeParas.map((paragraph) => ({ hash: hashText(paragraph.text) })),
  );
  assert.equal(aligned.filter((paragraph) => paragraph === null).length, 1);
  assert.ok(aligned.filter((paragraph) => paragraph !== null).length >= 2);
}

// --- mathematical notation ---
{
  const tex = 'W(T) = W_{\\min} + (W_{\\text{rest}} - W_{\\min})\\, e^{-k(T - T_{\\text{cold}})}';
  const printed = 'W(T) = Wₘᵢₙ + (Wᵣₑₛₜ − Wₘᵢₙ) e^(−k(T − T_cold))';
  assert.equal(texToUnicode(tex), printed);
  assert.equal(texToUnicode('\\frac{1}{2}'), '(1)/(2)');
  assert.equal(texToUnicode('\\sqrt{x}'), '√(x)');
  assert.equal(texToUnicode('\\alpha \\leq \\infty'), 'α ≤ ∞');

  const display = `$$\n${tex}\n$$`;
  const sentence = `The heat followed $${tex}$.`;
  const prose = `She paid $20 and $3.50.\n\n${display}\n\n${sentence}\n\nShe saw the the lantern.`;

  const spans = findMathSpans(prose);
  assert.equal(spans.length, 2);
  assert.equal(spans[0].display, true);
  assert.equal(spans[1].display, false);
  assert.equal(spans[1].tex, tex);
  assert.equal(findMathSpans('She paid $20 and $3.50.').length, 0);
  assert.equal(findMathSpans('A cost of \\$20 and an unclosed $$start.').length, 0);

  const plain = toPlainText(prose);
  assert.equal(plain.includes(printed), true);
  assert.equal(plain.includes('_{'), false);
  assert.equal(plain.includes('$20'), true);
  assert.equal(toPublishMarkdown(prose).includes('$$'), true);
  assert.equal(toPublishMarkdown(prose).includes('\\min'), true);

  const repeat = findGrammarIssues('She saw the the lantern.', { enabled: true, rules: { repeat: true } });
  assert.equal(repeat.some((issue) => issue.rule === 'repeat'), true);
  const hidden = findGrammarIssues(`She saw the lantern.\n\n$$the the$$\n\nA quiet room.`, {
    enabled: true,
    rules: { repeat: true },
  });
  assert.equal(hidden.some((issue) => issue.rule === 'repeat'), false);

  assert.equal(countWords(`The cabin held.\n\n$$${tex}$$`), 3);

  const epub = await toEpub(`## Cold\n\n${display}\n`, 'Cold');
  const zip = await JSZip.loadAsync(Buffer.from(await epub.arrayBuffer()));
  const xhtmlName = Object.keys(zip.files).find((name) => name.endsWith('.xhtml') && name.includes('item'));
  assert.ok(xhtmlName, 'chapter xhtml missing');
  const xhtml = await zip.file(xhtmlName!)!.async('string');
  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  assert.equal(xhtml.includes('<math'), true);
  assert.equal(xhtml.includes('epub:switch'), true);
  assert.equal(xhtml.includes('epub:default'), true);
  assert.equal(xhtml.includes(printed), true);
  assert.equal(xhtml.includes('class="equation"'), true);
  assert.equal(opf.includes('properties="mathml"'), true);
  assert.equal(xhtml.includes('$'), false);
}

// --- issue list follows the manuscript and drops duplicates ---
{
  const doc = 'She saw the the lantern. Elara smiled.';
  const repeated = doc.indexOf('the the');
  const name = doc.indexOf('Elara');
  const items = collectIssues(doc, [
    {
      from: 0,
      grammar: [
        { from: repeated, to: repeated + 'the the'.length, rule: 'repeat', message: '“the” is repeated.' },
        { from: repeated, to: repeated + 'the the'.length, rule: 'repeat', message: '“the” is repeated.' },
      ],
      spelling: [{ from: name, to: name + 'Elara'.length }],
    },
  ]);
  assert.deepEqual(
    items.map((item) => [item.kind, item.excerpt, item.from]),
    [
      ['grammar', 'the the', repeated],
      ['spelling', 'Elara', name],
    ],
  );
  assert.equal(items[0].label, '“the” is repeated.');
  const skipped = collectIssues(doc, [
    {
      from: 0,
      grammar: [{ from: 0, to: 0, rule: 'repeat', message: 'empty' }],
      spelling: [{ from: -1, to: 4 }],
    },
  ]);
  assert.equal(skipped.length, 0);
}

// --- release tags ---
{
  assert.throws(() => versionFromTag('v.1.1.1'), /v1\.2\.3/);
  assert.throws(() => versionFromTag('v1.1'), /v1\.2\.3/);
  assert.equal(versionFromTag('v1.1.1'), '1.1.1');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  fs.mkdirSync(path.join(root, 'src-tauri'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{\n  "name": "simple-author",\n  "version": "1.0.3"\n}\n');
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    '{\n  "name": "simple-author",\n  "version": "1.0.3",\n  "packages": {\n    "": {\n      "name": "simple-author",\n      "version": "1.0.3"\n    }\n  }\n}\n',
  );
  fs.writeFileSync(path.join(root, 'src-tauri/tauri.conf.json'), '{\n  "version": "1.0.3"\n}\n');
  fs.writeFileSync(path.join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "simple-author"\nversion = "1.0.3"\n');
  fs.writeFileSync(
    path.join(root, 'src-tauri/Cargo.lock'),
    '[[package]]\nname = "simple-author"\nversion = "1.0.3"\n\n[[package]]\nname = "siphasher"\nversion = "1.0.3"\n',
  );
  assert.equal(stampReleaseVersion('v1.1.1', root), '1.1.1');
  assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('"version": "1.1.1"'), true);
  assert.equal(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8').includes('"version": "1.1.1"'), true);
  assert.equal(fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8').includes('version = "1.1.1"'), true);
  const lock = fs.readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8');
  assert.equal(lock.includes('name = "simple-author"\nversion = "1.1.1"'), true);
  assert.equal(lock.includes('name = "siphasher"\nversion = "1.0.3"'), true);
  const npmLock = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8');
  assert.equal(npmLock.includes('"version": "1.0.3"'), false);
}

console.log('editing checks passed');
