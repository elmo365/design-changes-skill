// Reading a canvas as source — no browser. The design is code held byte for
// byte, so boards, copy and styles are cut from it directly.
import { createHash } from 'node:crypto';
import { CONFIG } from './config.mjs';

export const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', times: '×', rarr: '→', larr: '←', minus: '−' };
export const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const ID = CONFIG.board_id ? new RegExp(CONFIG.board_id) : null;
export const BETWEEN = '(between boards)';

/**
 * label → markup, for every board in a canvas, plus BETWEEN for the text that
 * sits outside every board (tagged with the board it follows).
 *
 * Each board is its own element carrying the board attribute. The markup is
 * not always balanced, so a board never runs past the next board's opening.
 */
export function boards(html) {
  const found = new Map();
  let between = '';
  let last = 0;
  let prev = null;
  const re = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*${CONFIG.board_attr}="([^"]+)"[^>]*>`, 'g');
  const starts = [...html.matchAll(re)].map((x) => x.index);
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const cap = starts.find((s) => s > m.index) ?? html.length;
    const open = new RegExp(`<${tag}[\\s>/]`, 'g');
    const close = new RegExp(`</${tag}>`, 'g');
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0) {
      open.lastIndex = i;
      close.lastIndex = i;
      const o = open.exec(html);
      const c = close.exec(html);
      if (!c) { i = html.length; break; }
      if (o && o.index < c.index) { depth += 1; i = o.index + 1; } else { depth -= 1; i = c.index + c[0].length; }
    }
    i = Math.min(i, cap);
    between += claim(prev, html.slice(last, m.index), found);
    prev = decode(m[2]);
    found.set(prev, html.slice(m.index, i));
    last = i;
    re.lastIndex = i;
  }
  between += claim(prev, html.slice(last), found);
  found.set(BETWEEN, between);
  return found;
}

// A caption just after a board, leading with that board's own id
// ("12F · MARK DELIVERED"), belongs to the board; other gap text stays between.
function claim(prev, gap, found) {
  const tagged = (g) => `\n<!--after:${prev ?? 'start of canvas'}-->\n${g}\n`;
  if (!prev || !ID) return tagged(gap);
  const id = ID.exec(prev)?.[1];
  const own = id && copyLines(gap).slice(0, 3).some((l) => l.startsWith(`${id} · `));
  if (!own) return tagged(gap);
  found.set(prev, found.get(prev) + gap);
  return '\n';
}

/** BETWEEN text, split back into the pieces each board precedes. */
export function betweenPieces(text) {
  const pieces = new Map();
  for (const part of text.split('<!--after:').slice(1)) {
    const end = part.indexOf('-->');
    pieces.set(part.slice(0, end), (pieces.get(part.slice(0, end)) || '') + part.slice(end + 3));
  }
  return pieces;
}

/** The copy of a block, one line per visual line; template bindings dropped. */
export function copyLines(block) {
  return decode(block
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<(br|\/div|\/p|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 1 && !s.startsWith('<') && !/^\{\{.*\}\}$/.test(s));
}

/** Inline style declarations as a multiset per property. */
export function styles(block) {
  const byProp = new Map();
  for (const m of block.matchAll(/style="([^"]*)"/g)) {
    for (const decl of m[1].split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      const p = decl.slice(0, at).trim().toLowerCase();
      const v = decl.slice(at + 1).trim();
      if (!p || !v) continue;
      if (!byProp.has(p)) byProp.set(p, []);
      byProp.get(p).push(v);
    }
  }
  return byProp;
}

export const bagMinus = (a, b) => {
  const left = [...b];
  return a.filter((x) => { const i = left.indexOf(x); if (i >= 0) { left.splice(i, 1); return false; } return true; });
};

// Minor: a difference nobody could tell apart on a handset — lengths within
// 1 px or 2 %, colours within a small distance (stand-in for ΔE < 2).
const num = (v) => { const m = /^(-?\d*\.?\d+)(px|%|rem|em)?$/.exec(v.trim()); return m ? { n: +m[1], u: m[2] || '' } : null; };
const hex = (v) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
function minor(a, b) {
  const na = num(a), nb = num(b);
  if (na && nb && na.u === nb.u) return Math.abs(na.n - nb.n) <= 1 || Math.abs(na.n - nb.n) <= Math.abs(na.n) * 0.02;
  const ca = hex(a), cb = hex(b);
  if (ca && cb) return Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) < 6;
  return false;
}
export function styleChanges(oldB, newB) {
  const o = styles(oldB), n = styles(newB);
  const lines = [];
  for (const p of new Set([...o.keys(), ...n.keys()])) {
    const gone = bagMinus(o.get(p) || [], n.get(p) || []);
    const came = bagMinus(n.get(p) || [], o.get(p) || []);
    const pairs = Math.min(gone.length, came.length);
    for (let i = 0; i < pairs; i++) lines.push({ p, from: gone[i], to: came[i], minor: minor(gone[i], came[i]) });
    for (const v of gone.slice(pairs)) lines.push({ p, from: v, to: null, minor: false });
    for (const v of came.slice(pairs)) lines.push({ p, from: null, to: v, minor: false });
  }
  return lines;
}

/** A board's id, from its label or its caption line ("13C · …"). */
export function boardId(label, block) {
  if (!ID) return null;
  const lead = ID.exec(label);
  if (lead) return lead[1];
  const src = ID.source.replace(/^\^/, '').replace(/\\b$/, '');
  const capRe = new RegExp(`^${src}\\s·\\s[A-Z]`);
  const cap = copyLines(block).map((l) => capRe.exec(l)).find(Boolean);
  return cap ? cap[1] : null;
}

/** A regex that finds a board id written as an id in code. */
export function idPattern(id) {
  // A bare number ("11") is everywhere in code; it counts only in backticks, or
  // as "11 · " the way captions write it — and not glued to a word, so a
  // project's own label such as "B13 · " does not read as board 13.
  return /^\d+$/.test(id)
    ? new RegExp(`\`${id}\`|(^|[^0-9A-Za-z])${id} · `)
    : new RegExp(`(^|[^A-Za-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`);
}
