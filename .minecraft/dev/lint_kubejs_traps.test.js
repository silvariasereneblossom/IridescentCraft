// lint_kubejs_traps.test.js -- does lint_kubejs_traps.js still flag what it exists to flag?
//
//   node .minecraft/dev/lint_kubejs_traps.test.js            # every part
//   node .minecraft/dev/lint_kubejs_traps.test.js ratchet    # only the parts whose name holds the word
//
// Exit 0 when every case behaves, 1 otherwise, 2 when it could not run (no git).
//
// PART ratchet-base   `--ratchet-base=<ref>` in a temporary git repository: a grandfathered count that is
//                     raised by hand, a file that appears with a count, a deleted counts file are flagged; a
//                     lowered count, an untouched file and a script that MOVED with its count are not.
//
// Nothing in the real tree is touched: every case runs on a copy in a temporary folder.
// Run by the pre-push hook when the lint, this test or a fixture changes (install-hooks.ps1, the block
// "Lint ratchets against the base commit") and by the `KubeJS script checks` Action.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const LINT = path.join(__dirname, 'lint_kubejs_traps.js');
const only = process.argv.slice(2);
const wanted = (part) => only.length === 0 || only.some(w => part.indexOf(w) >= 0);

let cases = 0, bad = 0;
function check(name, ok, detail) {
  cases++;
  if (ok) { console.log('ok    ' + name); return; }
  bad++;
  console.log('FAIL  ' + name);
  if (detail) console.log('      ' + String(detail).trim().split(/\r?\n/).slice(-14).join('\n      '));
}
function runLint(lint, args, cwd) {
  const r = spawnSync(process.execPath, ['--expose-internals', lint].concat(args), { cwd: cwd || path.dirname(lint), encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function tmpDir(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), 'trap-lint-' + tag + '-')); }
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* swallow-ok: a temp folder Windows still holds open; the OS clears it */ } }
function write(root, rel, text) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

// =====================================================================================================
// PART ratchet-base
// =====================================================================================================
function partRatchetBase() {
  const DEV = '.minecraft/dev/';
  const COUNTS = DEV + 'lint_kubejs_traps.silent_catches.json';
  const counts = (map) => JSON.stringify({ comment: 'test', taken: 'test', total: 0,
    files: Object.fromEntries(Object.entries(map).map(([k, n]) => [k, { count: n, ids: [] }])) }, null, 2) + '\n';
  let git;
  const mk = () => {
    const root = tmpDir('ratchet');
    git = (...a) => execFileSync('git', ['-C', root].concat(a), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q');
    git('config', 'user.email', 'lint-test@example.invalid');
    git('config', 'user.name', 'lint test');
    git('config', 'core.autocrlf', 'false');
    git('config', 'commit.gpgsign', 'false');
    write(root, DEV + 'lint_kubejs_traps.js', fs.readFileSync(LINT));
    write(root, DEV + 'lint_kubejs_traps.exceptions.json', '{ "exceptions": [] }\n');
    write(root, COUNTS, counts({ 'server_scripts/a.js': 2, 'server_scripts/sub/b.js': 1 }));
    write(root, '.minecraft/kubejs/server_scripts/a.js', '// a\n');
    write(root, '.minecraft/kubejs/server_scripts/sub/b.js', '// b\n');
    write(root, '.minecraft/kubejs/server_scripts/c.js', '// c\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    return root;
  };
  const lintOf = (root) => path.join(root, DEV, 'lint_kubejs_traps.js');
  // (name, change(root) -> extra arguments or nothing, expected exit code, texts the output must hold, texts it must not hold)
  const CASES = [
    ['nothing changed', () => {}, 0, ['3 -> 3 grandfathered', '0 flag(s)'], ['RATCHET-RAISED']],
    ['a count lowered', (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 1, 'server_scripts/sub/b.js': 1 })), 0, ['3 -> 2 grandfathered'], ['RATCHET-RAISED']],
    ['a file fixed completely and dropped from the list', (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 2 })), 0, ['3 -> 2 grandfathered'], ['RATCHET-RAISED']],
    ['a count raised by hand', (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 3, 'server_scripts/sub/b.js': 1 })), 1,
      ['server_scripts/a.js:0\tRATCHET-RAISED', '2 -> 3', '1 flag(s)'], []],
    ['a file that appears with a count', (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 2, 'server_scripts/sub/b.js': 1, 'server_scripts/c.js': 1 })), 1,
      ['server_scripts/c.js:0\tRATCHET-RAISED', '0 -> 1'], []],
    ['one count lowered, another raised: the sum is the same, still a flag',
      (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 1, 'server_scripts/sub/b.js': 2 })), 1, ['server_scripts/sub/b.js:0\tRATCHET-RAISED', '1 -> 2'], ['server_scripts/a.js:0']],
    ['a script that moved takes its count along', (root) => {
      fs.renameSync(path.join(root, '.minecraft/kubejs/server_scripts/a.js'), path.join(root, '.minecraft/kubejs/server_scripts/sub/a_moved.js'));
      write(root, COUNTS, counts({ 'server_scripts/sub/a_moved.js': 2, 'server_scripts/sub/b.js': 1 }));
    }, 0, ['taken over from a script that no longer exists', '0 flag(s)'], ['RATCHET-RAISED']],
    ['a script that moved and gained one', (root) => {
      fs.renameSync(path.join(root, '.minecraft/kubejs/server_scripts/a.js'), path.join(root, '.minecraft/kubejs/server_scripts/sub/a_moved.js'));
      write(root, COUNTS, counts({ 'server_scripts/sub/a_moved.js': 3, 'server_scripts/sub/b.js': 1 }));
    }, 1, ['server_scripts/sub/a_moved.js:0\tRATCHET-RAISED', '0 -> 3'], []],
    ['a key renamed while the old script is still there', (root) =>
      write(root, COUNTS, counts({ 'server_scripts/c.js': 2, 'server_scripts/sub/b.js': 1 })), 1, ['server_scripts/c.js:0\tRATCHET-RAISED'], []],
    ['the counts file deleted', (root) => fs.unlinkSync(path.join(root, COUNTS)), 1, ['RATCHET-RAISED', 'is gone here'], []],
    ['a base from before the counts file existed', (root) => {
      git('rm', '-q', '--cached', COUNTS); git('commit', '-q', '-m', 'no counts file yet');
      write(root, COUNTS, counts({ 'server_scripts/a.js': 9 }));
    }, 0, ['nothing to compare', '0 counts file(s) compared'], ['RATCHET-RAISED']],
    ['an unknown ref', () => ['--ratchet-base=no-such-ref'], 2, ['is not a commit of this clone'], []],
    ['--ratchet-head: the committed counts are judged, not the working tree', (root) => {
      write(root, COUNTS, counts({ 'server_scripts/a.js': 5, 'server_scripts/sub/b.js': 1 }));
      git('add', '-A'); git('commit', '-q', '-m', 'raised');
      write(root, COUNTS, counts({ 'server_scripts/a.js': 2, 'server_scripts/sub/b.js': 1 }));   // put back in the tree only
      return ['--ratchet-base=HEAD~1', '--ratchet-head=HEAD'];
    }, 1, ['server_scripts/a.js:0\tRATCHET-RAISED', '2 -> 5'], []],
    ['--ratchet-head: a moved script is looked up in that commit', (root) => {
      git('mv', '.minecraft/kubejs/server_scripts/a.js', '.minecraft/kubejs/server_scripts/sub/a_moved.js');
      write(root, COUNTS, counts({ 'server_scripts/sub/a_moved.js': 2, 'server_scripts/sub/b.js': 1 }));
      git('add', '-A'); git('commit', '-q', '-m', 'moved');
      write(root, '.minecraft/kubejs/server_scripts/a.js', '// back in the tree only\n');
      return ['--ratchet-base=HEAD~1', '--ratchet-head=HEAD'];
    }, 0, ['taken over from a script that no longer exists'], ['RATCHET-RAISED']],
    ['--ratchet-base takes no file argument', () => ['--ratchet-base=HEAD', 'x.js'], 2, ['is a run of its own'], []],
    ['--ratchet-head without --ratchet-base', () => ['--ratchet-head=HEAD'], 2, ['needs --ratchet-base'], []],
  ];
  for (const [name, change, wantCode, want, wantNot] of CASES) {
    const root = mk();
    let r;
    try {
      const extra = change(root);
      r = runLint(lintOf(root), Array.isArray(extra) ? extra : ['--ratchet-base=HEAD'], root);
    } finally { rmrf(root); }
    const missing = want.filter(w => r.out.indexOf(w) < 0), present = wantNot.filter(w => r.out.indexOf(w) >= 0);
    check('ratchet-base: ' + name + ' (exit ' + r.code + ')', r.code === wantCode && !missing.length && !present.length,
      (r.code !== wantCode ? 'wanted exit ' + wantCode + '\n' : '') + missing.map(w => 'the output does not hold: ' + w + '\n').join('') +
      present.map(w => 'the output must not hold: ' + w + '\n').join('') + r.out);
  }
}

// =====================================================================================================
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
catch (e) { console.error('[trap-lint test] CANNOT RUN: git is not on PATH (' + e.message + ')'); process.exit(2); }
if (wanted('ratchet-base')) partRatchetBase();
console.log('\n[trap-lint test] ' + cases + ' case(s), ' + bad + ' failed');
process.exit(bad ? 1 : 0);
