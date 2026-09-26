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

const boardOpen = () => new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*${CONFIG.board_attr}="([^"]+)"[^>]*>`, 'g');
const attrOf = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** Every board's opening tag, in source order: its label and declared device. */
export function boardTags(html) {
  return [...html.matchAll(boardOpen())].map((m) => ({
    label: decode(m[2]), tag: m[1], index: m.index, device: attrOf(m[0], CONFIG.device_attr),
  }));
}

/**
 * label → markup, for every board in a canvas, plus BETWEEN for the text that
 * sits outside every board (tagged with the board it follows).
 *
 * Each board is its own element carrying the board attribute. The markup is
 * not always balanced, so a board never runs past the next board's opening;
 * the boards that had to be cut there are listed in `.unclosed`, which
 * `dc lint` fails on.
 */
export function boards(html) {
  const found = new Map();
  found.unclosed = new Set();
  let between = '';
  let last = 0;
  let prev = null;
  const re = boardOpen();
  const starts = [...html.matchAll(re)].map((x) => x.index);
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const cap = starts.find((s) => s > m.index) ?? html.length;
    const open = new RegExp(`<${tag}[\\s>/]`, 'g');
    const close = new RegExp(`</${tag}>`, 'g');
    let depth = 1;
    let i = re.lastIndex;
    let closed = true;
    while (depth > 0) {
      open.lastIndex = i;
      close.lastIndex = i;
      const o = open.exec(html);
      const c = close.exec(html);
      if (!c) { i = html.length; closed = false; break; }
      if (o && o.index < c.index) { depth += 1; i = o.index + 1; } else { depth -= 1; i = c.index + c[0].length; }
    }
    if (i > cap) { i = cap; closed = false; }
    between += claim(prev, html.slice(last, m.index), found);
    prev = decode(m[2]);
    found.set(prev, html.slice(m.index, i));
    if (!closed) found.unclosed.add(prev);
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

const num1 = (v) => (v == null ? null : +(/-?\d*\.?\d+/.exec(v)?.[0] ?? NaN) || null);

/**
 * The frame a board says it is drawn in, read from its source — never from a
 * picture, which shows only what one renderer made of it.
 *
 * - `component`: the first imported component given a size — a device frame
 *   such as `<x-import component-from-global-scope="AndroidDevice" …
 *   width="{{ 380 }}" height="{{ 760 }}">`;
 * - `style`: otherwise a fixed `width: <n>px` on the board's own box or its
 *   first child (a frame drawn as a plain box) — no deeper, where a fixed
 *   width is a logo or an icon, not the frame;
 * - `none`: the source states no width — the board is as wide as whatever
 *   holds it.
 */
export function frameOf(block) {
  for (const m of block.matchAll(/<(x-import|dc-import)\b[^>]*>/g)) {
    const t = m[0];
    const name = attrOf(t, 'component-from-global-scope') ?? attrOf(t, 'component') ?? attrOf(t, 'name');
    const hint = attrOf(t, 'hint-size')?.split(',');
    const w = num1(attrOf(t, 'width')) ?? num1(hint?.[0]);
    const h = num1(attrOf(t, 'height')) ?? num1(hint?.[1]);
    if (w) return { kind: 'component', name, width: w, height: h };
  }
  for (const m of [...block.matchAll(/<[a-zA-Z][\w-]*\b[^>]*>/g)].slice(0, 2)) {
    const w = /(?:^|[;"\s])width:\s*(\d+(?:\.\d+)?)px/.exec(attrOf(m[0], 'style') ?? '');
    if (w) return { kind: 'style', name: null, width: +w[1], height: null };
  }
  return { kind: 'none', name: null, width: null, height: null };
}

/** The device whose board-width range (`device_widths`) holds a frame's width, or null. */
export function deviceFor(width, widths = CONFIG.device_widths) {
  if (!width) return null;
  return Object.entries(widths).find(([, [lo, hi]]) => width >= lo && width <= hi)?.[0] ?? null;
}

/**
 * label → { device, source } for every board: the declared device_attr, else
 * the device the board's own frame is drawn at (a phone frame 380 wide is a
 * phone), else null. `source` is 'declared', 'frame' or null.
 *
 * A frame decides only what kind of device the mockup draws and the scale its
 * picture renders at — never a size for code (standing rule 1).
 */
export function devicesOf(html, widths = CONFIG.device_widths) {
  const cut = boards(html);
  return new Map(boardTags(html).map((t) => {
    if (t.device) return [t.label, { device: t.device, source: 'declared' }];
    const d = deviceFor(frameOf(cut.get(t.label) ?? '').width, widths);
    return [t.label, { device: d, source: d ? 'frame' : null }];
  }));
}

/** A board's id, from its label or its caption line ("13C · …"). */
export function boardId(label, block) {
  if (!ID) return null;
  const lead = ID.exec(label);
  if (lead) return lead[1];
  // A caption counts only written the required way: the id, then " · ". It is
  // looked for outside the device frame first — the screen inside may draw
  // text of the same shape ("3C · 4A", hair types on a styles screen), and
  // taking that for the id sent the design side to rewrite its own chips.
  const outside = block.replace(/<x-import\b[\s\S]*?<\/x-import>/g, ' ');
  for (const text of outside === block ? [block] : [outside, block]) {
    for (const line of copyLines(text)) {
      const m = ID.exec(line);
      if (m && line.startsWith(`${m[1]} · `)) return m[1];
    }
  }
  return null;
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
