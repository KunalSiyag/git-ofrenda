import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { findTheDeparted, rank } from '../src/graveyard.mjs';
import { inventedQuotes } from '../src/spirits.mjs';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ofrenda-'));
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'Ada', GIT_AUTHOR_EMAIL: 'a@x', GIT_COMMITTER_NAME: 'Ada', GIT_COMMITTER_EMAIL: 'a@x' } });
  const at = (d) => ({ GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d });
  const commit = (msg, date) => execFileSync('git', ['-C', dir, 'commit', '-qm', msg], { stdio: 'ignore', env: { ...process.env, ...at(date), GIT_AUTHOR_NAME: 'Ada', GIT_AUTHOR_EMAIL: 'a@x', GIT_COMMITTER_NAME: 'Ada', GIT_COMMITTER_EMAIL: 'a@x' } });
  g('init', '-q');
  const lines = (name) => Array.from({ length: 12 }, (_, i) => `const ${name}${i} = ${i};`).join('\n');

  writeFileSync(join(dir, 'old-router.js'), lines('route') + '\nfunction handleLegacy() {}\n');
  writeFileSync(join(dir, 'moved.js'), lines('moved'));
  writeFileSync(join(dir, 'phoenix.js'), lines('phoenix'));
  g('add', '.'); commit('birth of everything', '2020-01-01T00:00:00Z');

  execFileSync('mkdir', ['-p', join(dir, 'lib')]);
  g('mv', 'moved.js', 'lib/moved.js'); commit('move moved.js into lib', '2021-01-01T00:00:00Z');

  g('rm', '-q', 'old-router.js');
  writeFileSync(join(dir, 'router.js'), lines('newRoute'));
  g('add', '.'); commit('replace old router', '2022-06-01T00:00:00Z');

  g('rm', '-q', 'phoenix.js'); commit('kill phoenix', '2022-07-01T00:00:00Z');
  writeFileSync(join(dir, 'phoenix.js'), lines('phoenix'));
  g('add', '.'); commit('phoenix rises', '2023-01-01T00:00:00Z');
  return dir;
}

test('finds the dead, ignores the renamed and the resurrected', () => {
  const dir = makeRepo();
  try {
    const dead = findTheDeparted(dir);
    assert.deepEqual(dead.map((f) => f.path), ['old-router.js']);
    const [f] = rank(dead, dir);
    assert.equal(f.born.date.slice(0, 10), '2020-01-01');
    assert.equal(f.died.subject, 'replace old router');
    assert.deepEqual(f.died.successors, ['router.js']);
    assert.equal(f.lifespanDays, 882);
    assert.match(f.source, /handleLegacy/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ghosts may only quote what they contained', () => {
  const file = { source: "x = 'app.set(\\'view engine\\', \\':T\\');'\nfunction handleLegacy() {}", path: 'a.js', subjects: ['remove binary'], died: { subject: 'remove binary', successors: [] }, born: { subject: 'init' } };
  assert.deepEqual(inventedQuotes('I ran `handleLegacy` and `"remove binary"`', file), []);
  assert.deepEqual(inventedQuotes("I set `app.set('view engine', ':T');`", file), []);
  assert.deepEqual(inventedQuotes('I ran `app.listen(9999)`', file), ['app.listen(9999)']);
});
