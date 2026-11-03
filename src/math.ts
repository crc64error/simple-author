// GitHub-style math: $$...$$ on its own, and $...$ inside a sentence when
// the contents are TeX (a command, subscript, or superscript). A price
// like $20 is left alone.
//
// Apple Books reads the MathML in an EPUB. Kindle skips MathML and shows
// the plain-text equation instead.

import temml from 'temml';

export interface MathSpan {
  from: number;
  to: number;
  display: boolean;
  tex: string;
}

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ',
  p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ',
};

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ',
  lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', phi: 'φ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Omega: 'Ω',
  times: '×', cdot: '·', pm: '±', mp: '∓',
  leq: '≤', geq: '≥', neq: '≠', approx: '≈', equiv: '≡',
  infty: '∞', partial: '∂', sum: '∑', prod: '∏', int: '∫',
  to: '→', rightarrow: '→', leftarrow: '←',
  ldots: '…', cdots: '⋯',
  min: 'min', max: 'max', sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', ln: 'ln', exp: 'exp',
};

function isEscaped(doc: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && doc[i] === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}

export function findMathSpans(doc: string): MathSpan[] {
  const spans: MathSpan[] = [];
  let i = 0;
  while (i < doc.length) {
    if (doc.startsWith('$$', i) && !isEscaped(doc, i)) {
      const close = doc.indexOf('$$', i + 2);
      if (close === -1) {
        i += 2;
        continue;
      }
      const tex = doc.slice(i + 2, close).trim();
      if (tex) spans.push({ from: i, to: close + 2, display: true, tex });
      i = close + 2;
      continue;
    }
    if (doc[i] === '$' && doc[i + 1] !== '$' && !isEscaped(doc, i)) {
      const lineEnd = doc.indexOf('\n', i);
      const limit = lineEnd === -1 ? doc.length : lineEnd;
      const close = doc.indexOf('$', i + 1);
      if (close !== -1 && close <= limit) {
        const tex = doc.slice(i + 1, close).trim();
        if (tex && /[\\_^{}]/.test(tex)) {
          spans.push({ from: i, to: close + 1, display: false, tex });
          i = close + 1;
          continue;
        }
      }
    }
    i += 1;
  }
  return spans;
}

export function rangeOverlapsMath(spans: MathSpan[], from: number, to: number): boolean {
  return spans.some((span) => from < span.to && to > span.from);
}

function formatScript(kind: '_' | '^', rendered: string): string {
  const map = kind === '_' ? SUB : SUP;
  const chars = [...rendered];
  if (chars.length > 0 && chars.every((ch) => map[ch] !== undefined)) {
    return chars.map((ch) => map[ch]).join('');
  }
  if (kind === '_' && /^[A-Za-z0-9]+$/.test(rendered)) return `_${rendered}`;
  if (kind === '_') return `_{${rendered}}`;
  return `^(${rendered})`;
}

export function texToUnicode(tex: string): string {
  const input = tex.replace(/\r\n/g, '\n');
  let i = 0;

  function parseSeq(stop?: string): string {
    let out = '';
    while (i < input.length && input[i] !== stop) {
      const ch = input[i];
      if (ch === ' ' || ch === '\n' || ch === '\t') {
        i += 1;
        if (out.length > 0 && !out.endsWith(' ')) out += ' ';
        continue;
      }
      out += parsePiece();
    }
    return out;
  }

  function parseGroup(): string {
    if (input[i] !== '{') return parsePiece();
    i += 1;
    const inner = parseSeq('}');
    if (input[i] === '}') i += 1;
    return inner;
  }

  function parseCommand(): string {
    i += 1;
    if (i >= input.length) return '';
    const ch = input[i];
    if (!/[A-Za-z]/.test(ch)) {
      i += 1;
      if (ch === ',' || ch === ';' || ch === ':' || ch === '!' || ch === ' ') return ' ';
      if (ch === '{' || ch === '}' || ch === '%' || ch === '&' || ch === '#' || ch === '_') return ch;
      return ch;
    }
    let name = '';
    while (i < input.length && /[A-Za-z]/.test(input[i])) {
      name += input[i];
      i += 1;
    }
    if (name === 'text' || name === 'mathrm' || name === 'mathbf' || name === 'mathit' || name === 'operatorname') {
      return parseGroup();
    }
    if (name === 'frac') {
      const top = parseGroup();
      const bottom = parseGroup();
      return `(${top})/(${bottom})`;
    }
    if (name === 'sqrt') {
      return `√(${parseGroup()})`;
    }
    if (name === 'left' || name === 'right') {
      if (input[i] === '\\') return parseCommand();
      return input[i++] ?? '';
    }
    return SYMBOLS[name] ?? name;
  }

  function parseBase(): string {
    if (i >= input.length) return '';
    const ch = input[i];
    if (ch === '\\') return parseCommand();
    if (ch === '{') return parseGroup();
    if (ch === '}') return '';
    i += 1;
    if (ch === '-') return '−';
    return ch;
  }

  function parsePiece(): string {
    let base = parseBase();
    while (i < input.length && (input[i] === '_' || input[i] === '^')) {
      const kind = input[i] as '_' | '^';
      i += 1;
      const arg = input[i] === '{' ? parseGroup() : parseBase();
      base += formatScript(kind, arg);
    }
    return base;
  }

  return parseSeq()
    .replace(/[ \t\u2009]+/g, ' ')
    .trim();
}

export function texToMathML(tex: string, display: boolean): string | null {
  try {
    const mathml = temml.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      xml: true,
    });
    return mathml.replace(/\s(?:class|style)="[^"]*"/g, '');
  } catch {
    return null;
  }
}

export function renderMathPlain(text: string): string {
  const spans = findMathSpans(text);
  if (spans.length === 0) return text;
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    out += text.slice(cursor, span.from);
    out += texToUnicode(span.tex);
    cursor = span.to;
  }
  return out + text.slice(cursor);
}

/** Drop TeX source from a word count. The equation is notation, not prose. */
export function stripMathSource(text: string): string {
  const spans = findMathSpans(text);
  if (spans.length === 0) return text;
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    out += text.slice(cursor, span.from);
    out += ' ';
    cursor = span.to;
  }
  return out + text.slice(cursor);
}
