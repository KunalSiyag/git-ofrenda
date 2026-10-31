#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { findTheDeparted, rank, repoName } from '../src/graveyard.mjs';
import { summonForAltar, seanceSystemPrompt, speak, MODEL, inventedQuotes } from '../src/spirits.mjs';
import { renderAltar } from '../src/altar.mjs';

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { m: (s) => `\x1b[38;5;214m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, p: (s) => `\x1b[38;5;177m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` }
  : { m: String, d: String, p: String, b: String };

const HELP = `git-ofrenda: a Día de los Muertos altar for the files your repo deleted.

  ofrenda graveyard [repo] [--top 15]          list the departed, longest-lived first
  ofrenda altar     [repo] [--top 7] [--out ofrenda.html]
                                               write epitaphs with a local model, render the altar
  ofrenda seance    <path> [repo] [--ask "…"]  talk to one file's ghost

Runs on Ollama (${MODEL} by default; set OFRENDA_MODEL / OLLAMA_HOST to change).`;

function parse(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
      opt[k] = k in opt ? [].concat(opt[k], v) : v;
    }
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

const yrs = (d) => (d / 365.25).toFixed(1).padStart(5) + 'y';

function loadDead(repo) {
  const all = findTheDeparted(repo);
  return { all, ranked: rank(all, repo), name: repoName(repo) };
}

async function graveyard(repo, top) {
  const { all, ranked, name } = loadDead(repo);
  console.log(`\n  ${C.m('⚱  The graveyard of')} ${C.b(name)}  ${C.d(`(${all.length} departed files)`)}\n`);
  for (const f of ranked.slice(0, top)) {
    console.log(`  ${C.m('✝')} ${C.b(f.path)}`);
    console.log(`    ${C.d(`${f.born.date.slice(0, 10)} → ${f.died.date.slice(0, 10)}`)} ${yrs(f.lifespanDays)}  ${String(f.lines).padStart(5)} lines  ${String(f.commits).padStart(4)} commits`);
    console.log(`    ${C.d('laid to rest in')} “${f.died.subject}”\n`);
  }
}

async function altar(repo, top, out) {
  const { all, ranked, name } = loadDead(repo);
  // One soul per funeral: a single cleanup commit should not fill the altar.
  const seen = new Set();
  const chosen = ranked.filter((f) => !seen.has(f.died.hash) && seen.add(f.died.hash)).slice(0, top);
  console.log(`\n  ${C.m('🕯  Building an ofrenda for')} ${C.b(name)} ${C.d(`with ${MODEL}`)}\n`);
  for (const f of chosen) {
    process.stdout.write(`  summoning ${C.b(f.path)} … `);
    const t = Date.now();
    f.ghost = await summonForAltar(f, name);
    console.log(f.ghost ? C.d(`${((Date.now() - t) / 1000).toFixed(1)}s${f.ghost.attempts > 1 ? `, ${f.ghost.attempts} tries (quoted something it never contained)${f.ghost.unquoted ? ', misquotes unquoted' : ''}` : ''}`) : C.p('silent'));
    if (f.ghost) console.log(`    ${C.p(f.ghost.epitaph)}\n`);
  }
  const html = renderAltar({ repoName: name, departed: chosen, totalDead: all.length, model: MODEL, generatedAt: new Date().toISOString() });
  writeFileSync(out, html);
  console.log(`  ${C.m('✿')} altar written to ${C.b(resolve(out))}\n`);
}

async function seance(path, repo, ask) {
  const { all, name } = loadDead(repo);
  const matches = all.filter((f) => f.path === path || f.path.endsWith('/' + path));
  if (!matches.length) {
    console.error(`  No departed file matches "${path}". Try \`ofrenda graveyard\` first.`);
    process.exit(1);
  }
  const file = rank(matches, repo)[0] ?? matches[0];
  const history = [{ role: 'system', content: seanceSystemPrompt(file, name) }];
  console.log(`\n  ${C.m('🕯  The candles gutter.')} ${C.d(`You call to ${file.path}, who left this world on ${file.died.date.slice(0, 10)}.`)}\n`);

  const turn = async (q) => {
    history.push({ role: 'user', content: q });
    process.stdout.write(`  ${C.p('👻')} `);
    const said = await speak(history, (t) => process.stdout.write(C.p(t.replace(/\n/g, '\n     '))));
    history.push({ role: 'assistant', content: said });
    const bad = inventedQuotes(said, file);
    console.log(bad.length ? `\n  ${C.d(`(the veil distorts: it quoted ${bad.map((b) => '`' + b + '`').join(', ')}, which it never contained)`)}\n` : '\n');
  };

  if (ask) {
    for (const q of [].concat(ask)) {
      console.log(`  ${C.b('you ›')} ${q}`);
      await turn(q);
    }
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(C.d('  (ask anything; an empty line or ctrl-d ends the séance)\n'));
  for (;;) {
    let q;
    try { q = (await rl.question(`  ${C.b('you ›')} `)).trim(); } catch { break; }
    if (!q) break;
    await turn(q);
  }
  rl.close();
  console.log(C.d('  The candle goes out.\n'));
}

const [cmd, ...rest] = process.argv.slice(2);
const { pos, opt } = parse(rest);
try {
  if (cmd === 'graveyard') await graveyard(resolve(pos[0] ?? '.'), Number(opt.top ?? 15));
  else if (cmd === 'altar') await altar(resolve(pos[0] ?? '.'), Number(opt.top ?? 7), opt.out ?? 'ofrenda.html');
  else if (cmd === 'seance' && pos[0]) await seance(pos[0], resolve(pos[1] ?? '.'), opt.ask);
  else console.log(HELP);
} catch (e) {
  console.error(`  ${e.message}`);
  process.exit(1);
}
