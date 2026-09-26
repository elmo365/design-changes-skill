// What changed in the design — narrowed from the file down to the element,
// then pointed at the code it affects.
//
//   dc diff [--from <ref>] [--to <ref>] [--shots <dir>] [--out <report.md>]
//   dc map                              regenerate SCREEN-CODE-MAP.md only
//   dc boards <canvas>                  list a canvas's boards; fail if one is lost
//   dc mark "<canvas>::<board label>"   record code built against the board as it is
//
// Layers, all on the design source except the fourth:
//   1. files   — design files that differ between the two versions
//   2. boards  — each canvas cut at its board elements: added, removed, changed
//   3. inside  — per changed board: copy added / removed; style changes paired
//                per property, old → new; changes under tolerance listed as minor
//   4. picture — with --shots: only the changed boards, old and new, rendered in
//                one browser run, compared with pixelmatch, regions clustered
//   5. code    — files that cite each changed board (by id or label), and
//                whether it changed since code was built against it (--mark)
//
// Claude Design keeps no version history of its own, so git is it.
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { CONFIG, ROOT, DESIGN, REPO, git, pkg, esm, opt, changedPaths, standingRules, owns } from './lib/config.mjs';
import { boards, devicesOf, betweenPieces, copyLines, styleChanges, bagMinus, boardId, sha, BETWEEN } from './lib/canvas.mjs';
import { loadLinks, audit } from './links.mjs';
import { launch, shoot, scaleFor } from './lib/shoot.mjs';

const REGISTRY = join(DESIGN, 'built-against.json');
const MAP = join(DESIGN, 'SCREEN-CODE-MAP.md');
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
const readAt = (ref, path) => {
  if (ref === null) return existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : null;
  try { return git('show', `${ref}:${path}`); } catch { return null; }
};
const registry = () => (existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf8')) : {});

// Which commit a mark belongs to is read from git, not stored: `dc mark` runs
// before the build is committed, so HEAD then is the commit before the build.
// The mark's hash first appears in built-against.json in the commit that
// carries the build — that is the one named.
const markCommits = new Map();
function markedIn(entry) {
  if (!markCommits.has(entry.hash)) {
    let c = '';
    try { c = git('log', '--reverse', '--format=%h', '-S', entry.hash, '--', rel(REGISTRY)).trim().split('\n')[0]; } catch { /* no history */ }
    markCommits.set(entry.hash, c || (entry.commit ? `${entry.commit} (recorded before the build)` : 'a mark not yet committed'));
  }
  return markCommits.get(entry.hash);
}
const canvases = () => readdirSync(DESIGN).filter((f) => f.endsWith(CONFIG.canvas_ext)).sort();

// ---- which code cites a board ----------------------------------------------
let codeFiles = null;
function allCode() {
  if (codeFiles) return codeFiles;
  codeFiles = [];
  const ext = new RegExp(`\\.(${CONFIG.code_ext.join('|')})$`);
  const designAbs = DESIGN;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (CONFIG.skip_dirs.includes(name)) continue;
      const p = join(dir, name);
      if (p === designAbs) continue; // the design is not code citing itself
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (ext.test(name)) codeFiles.push({ path: rel(p), text: readFileSync(p, 'utf8') });
    }
  };
  for (const root of CONFIG.code_roots) if (existsSync(join(ROOT, root))) walk(join(ROOT, root));
  return codeFiles;
}
// ---- which code implements a board ------------------------------------------
// From the verified links (links.mjs) and nothing else. A comment naming a
// board id is not evidence of anything (code-discovery §3): the id may have
// been reassigned or the board retired, and the comment keeps pointing wherever
// the id now lands. Links are made by discovery and checked on every run.
const linkedCode = (file, label) => (loadLinks()[`${file}::${label}`]?.code ?? []).map((c) => c.file);

// ---- the map ---------------------------------------------------------------
// Generated, never hand-kept: a hand-kept board → file map goes stale the day
// a file moves (Figma Code Connect's known failure).
export function writeMap() {
  const reg = registry();
  const rows = [];
  const refRows = [];
  const counts = { built: 0, partial: 0, absent: 0, none: 0, recheck: 0 };
  let stale = 0;
  const { rows: audited, stale: gone } = audit(canvases());
  const linkedFiles = new Set();
  const cell = (code) => code.map((c) => `\`${c.file}\`${c.symbol ? ` · ${c.symbol}` : ''}`).join('<br>');
  for (const r of audited) {
    const { file, label, id, link, problems } = r;
    for (const c of link?.code ?? []) linkedFiles.add(c.file);
    const where = file.replace(CONFIG.canvas_ext, '');
    if (!owns(file)) { refRows.push(`| ${id ?? '—'} | ${label} | ${where} | ${link ? cell(link.code) || link.status : '—'} |`); continue; }
    const built = reg[`${file}::${label}`];
    const block = boards(readFileSync(join(DESIGN, file), 'utf8')).get(label);
    const mark = built ? (built.hash === sha(block) ? `built against ${markedIn(built)}` : `**changed since ${markedIn(built)}**`) : '';
    if (built && built.hash !== sha(block)) stale += 1;
    let status;
    if (!link) { counts.none += 1; status = '**not yet linked**'; }
    else if (problems.length) { counts.recheck += 1; status = `**recheck** — ${problems.join('; ')}`; }
    else { counts[link.status] += 1; status = link.status === 'built' ? `built · checked ${link.checked}` : `**${link.status}** · checked ${link.checked}`; }
    rows.push(`| ${id ?? '—'} | ${label} | ${where} | ${link ? cell(link.code) || '—' : '—'} | ${link?.reached ?? ''} | ${status} | ${mark} |`);
  }

  // Screens in code that no link points at. Allowed only when built from the
  // design system — each kind's `require` / `forbid` rules say what that means.
  const sections = [];
  let undrawnTotal = 0;
  for (const kind of CONFIG.screens) {
    const pathRe = new RegExp(kind.path);
    const undrawn = allCode().filter((f) => pathRe.test(f.path))
      .filter((f) => !linkedFiles.has(f.path));
    undrawnTotal += undrawn.length;
    const req = Object.entries(kind.require ?? {});
    const forbid = Object.entries(kind.forbid ?? {});
    const passPath = kind.pass_path ? new RegExp(kind.pass_path) : null;
    const row = (cells) => `| ${cells.join(' | ')} |`;
    sections.push(
      `### ${kind.name ?? kind.path} (${undrawn.length})`, '',
      row(['Screen', ...req.map(([k]) => k), ...forbid.map(([k]) => k), 'Verdict']),
      row(['Screen', ...req, ...forbid, 'Verdict'].map(() => '---')),
      ...undrawn.map((f) => f.path).sort().map((p) => {
        const t = allCode().find((f) => f.path === p).text;
        const has = req.map(([, re]) => (passPath && passPath.test(p)) || new RegExp(re).test(t));
        const counts = forbid.map(([, re]) => (t.match(new RegExp(re, 'g')) || []).length);
        const ok = has.every(Boolean) && counts.every((n) => !n);
        return row([`\`${p}\``, ...has.map((h) => (h ? '✓' : '✗')), ...counts, ok ? '✓' : '**✗**']);
      }),
      '',
    );
  }

  const doc = [
    '# Screen ↔ code map — generated',
    '',
    `**Generated by the \`design-changes\` skill (\`dc map\`) — do not edit by hand.** Each board in the design that \`${REPO}\` builds and the code that implements it — from **verified links** (\`design/SCREEN-LINKS.json\`, made by discovery with \`dc link\`), never from comments. Each link is re-checked on every run: the file exists, the symbol is still declared in it, and the board has not changed since the link was checked.`,
    '',
    standingRules('> ⚑ '),
    '',
    `${rows.length} boards owned by ${REPO} · ${counts.built} built · ${counts.partial} partial · ${counts.absent} absent · **${counts.none} not yet linked** · ${counts.recheck} to recheck · ${stale} changed since built against${gone.length ? ` · ${gone.length} links to boards the design no longer has` : ''}${refRows.length ? ` · ${refRows.length} reference boards (another repo builds them)` : ''}`,
    '',
    '| Id | Board | Canvas | Implemented by | Reached | Link | Built against |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    refRows.length ? `## Reference boards — another repo builds these (${refRows.length})\n\nMirrored here because this repo's screens link to them (\`owns\` in design-changes.json says which canvases are this repo's). Diffed for history; demanded, built and marked in the repo that owns them — never here.\n\n| Id | Board | Canvas | Linked code here |\n|---|---|---|---|\n${refRows.join('\n')}\n` : '',
    gone.length ? `## Links to boards the design no longer has\n\n${gone.sort().map((o) => `- ${o}`).join('\n')}\n` : '',
    CONFIG.screens.length ? `## Screens in code no link points at (${undrawnTotal})\n\nEither a board is still to be linked to it, or it has no board — then it is allowed only when built from the design's components and theme. A ✗ is a screen that has left the design system — fix it, do not allow-list it.\n` : '',
    ...sections,
  ].join('\n');
  writeFileSync(MAP, doc);
  return `${rel(MAP)} regenerated: ${rows.length} boards owned, ${counts.built} built, ${counts.partial} partial, ${counts.absent} absent, ${counts.none} not yet linked, ${counts.recheck} to recheck, ${stale} changed since built, ${refRows.length} reference, ${undrawnTotal} screens no link points at`;
}

// ---- the commands ----------------------------------------------------------
export function listBoards(canvas) {
  const text = readFileSync(existsSync(canvas) ? canvas : join(DESIGN, canvas), 'utf8');
  const found = boards(text);
  const cut = [...found.keys()].filter((k) => k !== BETWEEN);
  const raw = [...text.matchAll(new RegExp(`${CONFIG.board_attr}="([^"]+)"`, 'g'))].map((m) => m[1]);
  for (const k of cut) console.log(`${boardId(k, found.get(k)) ?? '—'}\t${k}`);
  const lost = raw.filter((l) => !cut.includes(l));
  console.log(`${cut.length} boards cut, ${raw.length} labels in the source${lost.length ? ` — LOST: ${lost.join(', ')}` : ''}`);
  if (!cut.length) console.log(`No artboards: every screen must be one (${CONFIG.board_attr}). \`dc lint\` writes the demand.`);
  return lost.length || !cut.length ? 1 : 0;
}

export function markBuilt(mark) {
  const [file, label] = mark.split('::');
  const path = join(DESIGN, file);
  const block = existsSync(path) && boards(readFileSync(path, 'utf8')).get(label);
  if (!block) { console.error(`No board "${label}" in ${rel(path)}.`); return 1; }
  if (!owns(file)) { console.error(`${REPO} does not own ${file} (owns: ${JSON.stringify(CONFIG.owns)}) — it is reference here. Mark it in the repo that builds it.`); return 1; }
  const reg = registry();
  reg[mark] = { hash: sha(block), date: new Date().toISOString().slice(0, 10) };
  writeFileSync(REGISTRY, `${JSON.stringify(reg, null, 2)}\n`);
  console.log(`Marked ${mark} as built against ${reg[mark].hash}. Commit ${rel(REGISTRY)} with the build: that commit is the one the map names.`);
  return 0;
}

export default async function run() {
  const from = opt('--from', 'HEAD');
  const to = opt('--to'); // null = working tree
  const shots = opt('--shots');
  const out = opt('--out');
  const dd = CONFIG.design_dir;

  // -z everywhere: git quotes a path with unusual characters otherwise.
  const changed = (to === null ? git('diff', '--name-only', '-z', from, '--', dd) : git('diff', '--name-only', '-z', from, to, '--', dd))
    .split('\0').filter(Boolean)
    .filter((p) => /\.(html|md|jsx|js|css)$/.test(p) && !p.includes('/screenshots/') && !basename(p).startsWith('.diff-'));
  // New, untracked design files count too when diffing the working tree.
  if (to === null) {
    for (const f of changedPaths(dd)) {
      if (f.state === '??' && f.path.endsWith(CONFIG.canvas_ext) && !changed.includes(f.path)) changed.push(f.path);
    }
  }

  const report = [];
  const say = (s = '') => report.push(s);
  const toRender = [];
  const reg = registry();
  say(`# Design changes: ${from} → ${to ?? 'working tree'}`);
  say();
  say(standingRules('> ⚑ '));
  say();
  if (!changed.length) say('No design file changed.');

  for (const path of changed) {
    const oldText = readAt(from, path);
    const newText = readAt(to, path);
    const file = basename(path);
    say(`## ${file}${oldText === null ? ' — new file' : newText === null ? ' — deleted' : ''}${path.endsWith(CONFIG.canvas_ext) && !owns(file) ? ' — reference (another repo builds it)' : ''}`);
    if (newText === null) { say(); continue; }
    if (!path.endsWith(CONFIG.canvas_ext)) {
      if (oldText === null) { say(); continue; }
      const o = oldText.split(/\r?\n/), n = newText.split(/\r?\n/);
      const added = bagMinus(n, o).filter((l) => l.trim()), removed = bagMinus(o, n).filter((l) => l.trim());
      say(`${added.length} lines added, ${removed.length} removed.`);
      for (const l of removed.slice(0, 15)) say(`- − \`${l.trim().slice(0, 170)}\``);
      for (const l of added.slice(0, 15)) say(`- + \`${l.trim().slice(0, 170)}\``);
      say();
      continue;
    }

    const ob = oldText === null ? new Map([[BETWEEN, '']]) : boards(oldText);
    const nb = boards(newText);
    const real = (k) => k !== BETWEEN;
    const addedB = [...nb.keys()].filter((k) => real(k) && !ob.has(k));
    const removedB = [...ob.keys()].filter((k) => real(k) && !nb.has(k));
    const changedB = [...nb.keys()].filter((k) => real(k) && ob.has(k) && ob.get(k) !== nb.get(k));
    const betweenChanged = oldText !== null && ob.get(BETWEEN) !== nb.get(BETWEEN);
    say(`Boards ${[...nb.keys()].filter(real).length} (was ${[...ob.keys()].filter(real).length}) · added ${addedB.length} · removed ${removedB.length} · changed ${changedB.length}${betweenChanged ? ' · text between boards changed' : ''}`);
    say();

    const codeLine = (label, block) => {
      const id = boardId(label, block);
      const files = linkedCode(file, label);
      const built = reg[`${file}::${label}`];
      const stale = built && built.hash !== sha(block) ? ` · **changed since built against ${markedIn(built)} (${built.date})**` : built ? ' · built against this version' : '';
      return `  - code${id ? ` (id ${id})` : ''}: ${files.length ? files.join(', ') : '**no verified link — `dc link` it by discovery**'}${stale}`;
    };

    for (const b of addedB) {
      say(`- **added** ${b}`);
      say(codeLine(b, nb.get(b)));
      toRender.push({ file, path, board: b, old: null });
    }
    for (const b of removedB) say(`- **removed** ${b} — linked code: ${linkedCode(file, b).join(', ') || 'none'}`);
    for (const b of changedB) {
      const oc = copyLines(ob.get(b)), nc = copyLines(nb.get(b));
      const plus = bagMinus(nc, oc), less = bagMinus(oc, nc);
      const st = styleChanges(ob.get(b), nb.get(b));
      const major = st.filter((s) => !s.minor), small = st.filter((s) => s.minor);
      say(`- **changed** ${b} — copy +${plus.length} / −${less.length} · style ${major.length} changed${small.length ? `, ${small.length} minor` : ''}`);
      for (const l of less.slice(0, 10)) say(`  - − “${l.slice(0, 200)}”`);
      for (const l of plus.slice(0, 10)) say(`  - + “${l.slice(0, 200)}”`);
      for (const s of major.slice(0, 12)) say(`  - style \`${s.p}\`: ${s.from ?? '(none)'} → ${s.to ?? '(removed)'}`);
      say(codeLine(b, nb.get(b)));
      toRender.push({ file, path, board: b, old: oldText });
    }
    if (betweenChanged) {
      const op = betweenPieces(ob.get(BETWEEN)), np = betweenPieces(nb.get(BETWEEN));
      for (const after of new Set([...op.keys(), ...np.keys()])) {
        const oc = copyLines(op.get(after) || ''), nc = copyLines(np.get(after) || '');
        const plus = bagMinus(nc, oc), less = bagMinus(oc, nc);
        if (!plus.length && !less.length) continue;
        say(`- **notes after ${after}** — +${plus.length} / −${less.length}`);
        for (const l of less.slice(0, 5)) say(`  - − “${l.slice(0, 200)}”`);
        for (const l of plus.slice(0, 5)) say(`  - + “${l.slice(0, 200)}”`);
      }
    }
    say();
  }

  // ---- layer 4: the picture ------------------------------------------------
  if (shots && toRender.length) {
    mkdirSync(shots, { recursive: true });
    const pixelmatch = await esm('pixelmatch');
    const { PNG } = pkg('pngjs');
    const browser = await launch();
    // Old and new at one scale — the new board's device — each in a window
    // sized to the board (lib/shoot.mjs).
    const snap = async (file, label, dest, scale) => Boolean((await shoot(browser, file, [{ label, dest }], scale))[label]);
    // Staged beside the canvas so its relative assets still resolve.
    const staged = (text, tag, file) => { const p = join(DESIGN, `.diff-${tag}-${file}`); writeFileSync(p, text); return p; };
    say('## Pictures — only the changed boards');
    for (const item of toRender) {
      const slug = `${basename(item.file, CONFIG.canvas_ext)}--${item.board.replace(/[^A-Za-z0-9-]+/g, '_')}`;
      const newPng = join(shots, `${slug}.new.png`);
      const newText = to === null ? readFileSync(join(ROOT, item.path), 'utf8') : readAt(to, item.path);
      const scale = scaleFor(devicesOf(newText).get(item.board)?.device);
      const newFile = to === null ? join(ROOT, item.path) : staged(newText, 'new', item.file);
      const drawn = await snap(newFile, item.board, newPng, scale);
      if (to !== null) rmSync(newFile);
      if (!drawn) { say(`- ${item.board}: not drawn — no element carries its label in a browser`); continue; }
      if (!item.old) { say(`- ${item.board}: new board → ${basename(newPng)}`); continue; }
      const oldPng = join(shots, `${slug}.old.png`);
      const oldFile = staged(item.old, 'old', item.file);
      const drewOld = await snap(oldFile, item.board, oldPng, scale);
      rmSync(oldFile);
      if (!drewOld) { say(`- ${item.board}: old version not drawn → ${basename(newPng)} only`); continue; }
      const a = PNG.sync.read(readFileSync(oldPng)), b = PNG.sync.read(readFileSync(newPng));
      const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
      const pad = (img) => { const p = new PNG({ width: w, height: h }); p.data.fill(255); PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0); return p; };
      const pa = pad(a), pb = pad(b), diff = new PNG({ width: w, height: h });
      const count = pixelmatch(pa.data, pb.data, diff.data, w, h, { threshold: 0.1, includeAA: false, alpha: 0.2 });
      const regions = clusters(diff, w, h);
      const diffPng = join(shots, `${slug}.diff.png`);
      writeFileSync(diffPng, PNG.sync.write(diff));
      const share = (count / (w * h)) * 100;
      const shape = !regions.length ? 'rendering noise only' : regions.length === 1 ? 'one region' : `${regions.length} regions`;
      say(`- ${item.board}: ${share.toFixed(1)}% of pixels, ${shape}${a.height !== b.height ? ` · height ${a.height} → ${b.height}px` : ''} → ${basename(diffPng)}`);
      for (const r of regions.slice(0, 6)) say(`  - region at ${r.x},${r.y} size ${r.w}×${r.h}`);
    }
    await browser.close();
  }

  // The map is regenerated on every run, so no run leaves it describing a
  // design or code that has moved.
  say();
  say(`_${writeMap()}_`);
  const text = report.join('\n');
  console.log(text);
  if (out) writeFileSync(out, `${text}\n`);
  return 0;
}

/** Changed pixels clustered on a 16 px grid: one moved block reads as one region. */
export function clusters(diff, w, h, cell = 16) {
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell), grid = new Uint8Array(cols * rows);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (diff.data[i] > 200 && diff.data[i + 1] < 90) grid[Math.floor(y / cell) * cols + Math.floor(x / cell)] = 1;
  }
  const seen = new Uint8Array(cols * rows), regions = [];
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || seen[s]) continue;
    let minX = cols, minY = rows, maxX = 0, maxY = 0, size = 0;
    const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const c = stack.pop(), cx = c % cols, cy = Math.floor(c / cols);
      size += 1; minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, ni = ny * cols + nx;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && grid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    if (size >= 2) regions.push({ x: minX * cell, y: minY * cell, w: (maxX - minX + 1) * cell, h: (maxY - minY + 1) * cell });
  }
  return regions;
}
