// Walks a repo's history once and finds every file that died (deleted, never
// re-added, not renamed away). Everything here is facts straight from git:
// the model never invents a date, an author or a commit message.
import { execFileSync } from 'node:child_process';

const SEP = '\x1f';
const REC = '\x00';

export function git(repo, args, opts = {}) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    ...opts,
  });
}

const BINARY = /\.(png|jpe?g|gif|ico|webp|svg|pdf|zip|gz|tgz|woff2?|ttf|eot|mp[34]|mov|lock|min\.js)$/i;

export function findTheDeparted(repo) {
  const log = git(repo, [
    'log', '--reverse', '-M', '--name-status', '--no-merges',
    "--format=%x00%H%x1f%aI%x1f%an%x1f%s",
  ]);

  const files = new Map(); // path -> life record
  const alive = new Set(git(repo, ['ls-files']).split('\n').filter(Boolean));

  const life = (path) => {
    if (!files.has(path)) files.set(path, { path, born: null, died: null, commits: 0, authors: new Set(), subjects: [], renamedFrom: null, reincarnatedAs: null });
    return files.get(path);
  };

  for (const chunk of log.split(REC)) {
    if (!chunk.trim()) continue;
    const [header, ...rest] = chunk.split('\n');
    const [hash, date, author, subject] = header.split(SEP);
    const commit = { hash, date, author, subject };
    const born = [];
    const touched = rest.filter(Boolean).map((l) => l.split('\t'));

    for (const [status, a, b] of touched) {
      const kind = status[0];
      if (kind === 'A') {
        const f = life(a);
        // A file re-added after death is resurrected: start its life over.
        if (f.died) { f.died = null; f.born = null; f.commits = 0; f.subjects = []; f.authors = new Set(); }
        f.born ??= commit;
        born.push(a);
      } else if (kind === 'R') {
        const old = life(a);
        old.reincarnatedAs = { path: b, commit };
        const f = life(b);
        f.born ??= old.born ?? commit;
        f.renamedFrom = a;
        f.commits += old.commits;
        old.authors.forEach((x) => f.authors.add(x));
        f.subjects.push(...old.subjects);
      } else if (kind === 'D') {
        const f = life(a);
        f.died = { ...commit, successors: [] };
        f.deathCommitFiles = touched;
      }
      const target = kind === 'R' ? b : a;
      const f = life(target);
      f.commits += 1;
      f.authors.add(author);
      if (kind !== 'D') f.subjects.push(subject);
    }

    // Whatever was born in the same commit that killed a file is its successor.
    for (const [status, a] of touched) {
      if (status[0] === 'D') life(a).died.successors = born.slice(0, 6);
    }
  }

  const departed = [];
  for (const f of files.values()) {
    if (!f.died || alive.has(f.path) || f.reincarnatedAs) continue;
    if (BINARY.test(f.path)) continue;
    const born = f.born ?? f.died;
    const days = Math.max(0, Math.round((Date.parse(f.died.date) - Date.parse(born.date)) / 86400000));
    departed.push({
      path: f.path,
      born,
      died: f.died,
      lifespanDays: days,
      commits: f.commits,
      authors: [...f.authors],
      subjects: f.subjects.slice(-20),
      renamedFrom: f.renamedFrom,
    });
  }
  return departed;
}

export function lastWordsOf(repo, file) {
  try {
    return git(repo, ['show', `${file.died.hash}^:${file.path}`]);
  } catch {
    return '';
  }
}

export function rank(departed, repo) {
  for (const f of departed) {
    const src = lastWordsOf(repo, f);
    f.source = src;
    f.lines = src ? src.split('\n').length : 0;
    f.score = f.lifespanDays * Math.log2(2 + f.lines) * Math.log2(2 + f.commits);
  }
  return departed.filter((f) => f.lines >= 5).sort((a, b) => b.score - a.score);
}

export function repoName(repo) {
  try {
    const url = git(repo, ['config', '--get', 'remote.origin.url']).trim();
    const m = url.match(/[:/]([^/:]+\/[^/]+?)(\.git)?$/);
    if (m) return m[1];
  } catch {}
  return repo.split('/').filter(Boolean).pop();
}
